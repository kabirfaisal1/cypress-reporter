// utils/uploadUtils.js
const fs = require( "fs" );
const path = require( "path" );
const axios = require( "axios" );
const FormData = require( "form-data" );
require( "dotenv" ).config();

const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;

const AUTH = {
    username: JIRA_EMAIL,
    password: JIRA_API_TOKEN,
};

async function uploadScreenshotAndGetUrl ( issueKey, filePath )
{
    if ( !filePath || !fs.existsSync( filePath ) )
    {
        console.error( "❌ Screenshot file does not exist:", filePath );
        return null;
    }

    const form = new FormData();
    form.append( "file", fs.createReadStream( filePath ) );

    try
    {
        const res = await axios.post(
            `${ JIRA_BASE_URL }/rest/api/3/issue/${ issueKey }/attachments`,
            form,
            {
                auth: AUTH,
                headers: {
                    ...form.getHeaders(),
                    "X-Atlassian-Token": "no-check",
                },
            }
        );

        const attachment = res.data?.[0];
        if ( attachment )
        {
            console.log( `📎 Uploaded screenshot: ${ attachment.content }` );
            return {
                id: attachment.id,
                content: attachment.content,
            };
        }
    } catch ( err )
    {
        console.error( "❌ Failed to upload screenshot:", err.response?.data || err.message );
    }

    return null;
}

module.exports = {
    uploadScreenshotAndGetUrl,
};
