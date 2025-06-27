require( 'dotenv' ).config();
const axios = require( 'axios' );

const {
  TESTRAIL_DOMAIN,
  TESTRAIL_USERNAME,
  TESTRAIL_PASSWORD,
  TESTRAIL_PROJECT_ID,
} = process.env;

const AUTH = {
  username: TESTRAIL_USERNAME,
  password: TESTRAIL_PASSWORD,
};

// Extract [C####]
function extractCaseId ( fullTitle )
{
  const m = fullTitle.match( /\[C(\d+)\]/i );
  return m ? parseInt( m[1], 10 ) : null;
}

// Extract [P####] & [S####]
function extractProjectAndSuite ( fullTitle )
{
  let projectId = TESTRAIL_PROJECT_ID ? parseInt( TESTRAIL_PROJECT_ID, 10 ) : null;
  let suiteId = 1;
  const p = fullTitle.match( /\[P(\d+)\]/i );
  const s = fullTitle.match( /\[S(\d+)\]/i );
  if ( p ) projectId = parseInt( p[1], 10 );
  if ( s ) suiteId = parseInt( s[1], 10 );
  return { projectId, suiteId };
}

// Build run name from file path
function extractRunNameFromTests ( tests = [] )
{
  const now = new Date().toLocaleString();
  for ( const t of tests )
  {
    const fp = ( t.file || '' ).replace( /\\/g, '/' );
    const seg = fp.toLowerCase().split( 'cypress/e2e/' )[1];
    if ( seg )
    {
      const [grp, sub] = seg.split( '/' );
      return sub
        ? `${ grp.toUpperCase() }-${ sub.toUpperCase() } Automated Run (${ now })`
        : `${ grp.toUpperCase() } Automated Run (${ now })`;
    }
  }
  return `Automated Cypress Run (${ now })`;
}

// Try get_cases; if that returns a single object, treat as one-element array.
async function getValidCaseIds ( projectId, suiteId, caseIds )
{
  let valid = [];
  try
  {
    const url = `${ TESTRAIL_DOMAIN }/index.php?/api/v2/get_cases/${ projectId }&suite_id=${ suiteId }`;
    const res = await axios.get( url, { auth: AUTH } );
    let casesList = [];
    if ( Array.isArray( res.data ) )
    {
      casesList = res.data;
    } else if ( res.data && Array.isArray( res.data.cases ) )
    {
      casesList = res.data.cases;
    } else if ( res.data && res.data.id )
    {
      // single-case object returned
      casesList = [res.data];
    }

    const known = new Set( casesList.map( c => c.id ) );
    valid = caseIds.filter( id => known.has( id ) );
  } catch ( err )
  {
    console.warn( '⚠ get_cases failed, falling back to get_case per ID' );
  }

  // For any missing IDs, try GET get_case/{id} individually
  const missing = caseIds.filter( id => !valid.includes( id ) );
  for ( const id of missing )
  {
    try
    {
      const res = await axios.get(
        `${ TESTRAIL_DOMAIN }/index.php?/api/v2/get_case/${ id }`,
        { auth: AUTH }
      );
      const c = res.data;
      if ( c.id === id && c.suite_id === suiteId )
      {
        valid.push( id );
      } else
      {
        console.warn( `⚠ Case ${ id } found but suite_id ${ c.suite_id } ≠ ${ suiteId }` );
      }
    } catch ( err )
    {
      console.warn( `⚠ Could not fetch case ${ id }:`, err.response?.data || err.message );
    }
  }

  // dedupe
  return Array.from( new Set( valid ) );
}

// Create a run
async function createTestRun ( projectId, caseIds = [], suiteId = 1, runName = null )
{
  const payload = {
    name: runName || `Automated Cypress Run - ${ new Date().toLocaleString() }`,
    suite_id: suiteId,
    include_all: false,
    case_ids: caseIds,
  };

  console.log( '📤 Creating TestRail Run' );
  console.log( `   ➤ Project ID: ${ projectId }` );
  console.log( `   ➤ Suite ID: ${ suiteId }` );
  console.log( `   ➤ Run Name: ${ payload.name }` );
  console.log( `   ➤ Case IDs: ${ caseIds.join( ', ' ) }` );

  if ( !projectId || !suiteId || caseIds.length === 0 )
  {
    console.error( '❌ Missing required data for TestRail run creation.' );
    return null;
  }

  try
  {
    const res = await axios.post(
      `${ TESTRAIL_DOMAIN }/index.php?/api/v2/add_run/${ projectId }`,
      payload,
      { auth: AUTH }
    );
    return res.data.id;
  } catch ( err )
  {
    console.error( '❌ TestRail Run creation failed:', err.response?.data || err.message );
    return null;
  }
}

// Close a run
async function closeTestRun ( runId )
{
  try
  {
    await axios.post(
      `${ TESTRAIL_DOMAIN }/index.php?/api/v2/close_run/${ runId }`,
      {},
      { auth: AUTH }
    );
    console.log( `🔒 Closed TestRail RunID ${ runId }` );
  } catch ( err )
  {
    console.error( `❌ Failed to close TestRail run ${ runId }:`, err.response?.data || err.message );
  }
}

exports.reportToTestRail = async ( passed = [], failed = [] ) =>
{
  if ( !TESTRAIL_DOMAIN || !TESTRAIL_USERNAME || !TESTRAIL_PASSWORD )
  {
    console.warn( '⚠ TestRail not fully configured. Skipping.' );
    return;
  }

  // flatten entries
  const all = [...passed, ...failed].map( t =>
  {
    const full = t.fullTitle || t.name || '';
    const cid = extractCaseId( full );
    if ( !cid ) return null;
    const { projectId, suiteId } = extractProjectAndSuite( full );
    return {
      projectId,
      suiteId,
      caseId: cid,
      state: t.state,
      comment: t.error || ( t.state === 'passed' ? 'Test passed ✅' : '' ),
      file: t.file,
      raw: t,
    };
  } ).filter( Boolean );

  // group by P-S
  const groups = {};
  for ( const e of all )
  {
    const key = `${ e.projectId }-${ e.suiteId }`;
    groups[key] = groups[key] || { projectId: e.projectId, suiteId: e.suiteId, entries: [] };
    groups[key].entries.push( e );
  }

  // process each group
  for ( const key of Object.keys( groups ) )
  {
    const { projectId, suiteId, entries } = groups[key];
    const caseIds = Array.from( new Set( entries.map( e => e.caseId ) ) );
    console.log( `🔍 Found ${ caseIds.length } unique TestRail Case IDs for P${ projectId }/S${ suiteId }:`, caseIds );

    // filter valid
    const valid = await getValidCaseIds( projectId, suiteId, caseIds );
    const invalid = caseIds.filter( id => !valid.includes( id ) );
    if ( invalid.length ) console.warn( '⚠ Omitting unrecognized TestRail IDs:', invalid );
    if ( !valid.length )
    {
      console.warn( `⚠ No valid cases for P${ projectId }/S${ suiteId }. Skipping run.` );
      continue;
    }

    const runName = extractRunNameFromTests( entries.map( e => e.raw ) );
    const runId = await createTestRun( projectId, valid, suiteId, runName );
    if ( !runId )
    {
      console.warn( '⚠ Skipping result upload due to failed run creation.' );
      continue;
    }

    // only report valid entries
    const toReport = entries.filter( e => valid.includes( e.caseId ) ).map( e => ( {
      case_id: e.caseId,
      status_id: e.state === 'passed' ? 1 : 5,
      comment: e.comment,
    } ) );

    try
    {
      await axios.post(
        `${ TESTRAIL_DOMAIN }/index.php?/api/v2/add_results_for_cases/${ runId }`,
        { results: toReport },
        { auth: AUTH }
      );
      console.log( `✅ Reported ${ toReport.length } results to TestRail RunID ${ runId }, ProjectID ${ projectId }` );

      // 🟢 Close the run after reporting
      await closeTestRun( runId );

    } catch ( err )
    {
      console.error( '❌ Error reporting results to TestRail:', err.response?.data || err.message );
    }
  }
};
