import fs from 'fs';
import readline from 'readline';

import { google } from 'googleapis';
const OAuth2 = google.auth.OAuth2;

/**
 * Simple abstraction over the Youtube API
 */
export class Youtube {
    authorized = false;

    /**
     * Create a new Youtube API interface
     * @param {string} client_secret_path - path to client secret
     * @param {string} api_key_path - path to API key
     * @param {string} token_path - path to user token
     * @param {string[]} scopes - API scopes needed
     * 
     * P.S. You must call authorize() on the instance before making any API calls!
     */
    constructor(
        client_secret_path,
        api_key_path,
        token_path,
        scopes
    ) {
        this.client_secret_path = client_secret_path;
        this.api_key_path = api_key_path;
        this.token_path = token_path;

        this.scopes = scopes;
    }

    get_new_token() {
        // Generate auth url
        const auth_url = this.oauth2_client.generateAuthUrl({
            access_type: 'offline',
            scope: this.scopes,
        });

        console.log("Please authorize the Youtube API by visiting this url:");
        console.log(auth_url);

        let rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // Get auth code from user
        return new Promise((resolve, reject) => {
            rl.question("Code: ", (code) => {
                rl.close();

                this.oauth2_client.getToken(code, (err, token) => {
                    if (err) reject(err);

                    const token_json = JSON.stringify(token, null, 4);

                    // Save new token to file
                    fs.promises.writeFile(this.token_path, token_json, (err) => {
                        if (err) reject(err);
                        console.log("Saved new token")
                    });

                    // Finally return the token
                    resolve(token_json);
                });
            });
        });
    }

    /**
     * Authorize the Youtube API in order to make calls
     */
    async authorize() {
        // Load client secret
        let data = await fs.promises.readFile(this.client_secret_path)
            .catch((err) => {
                throw `'${this.client_secret_path}' is missing! Did you set the path correctly?`;
            });

        this.credidentials = JSON.parse(data);

        // Create OAuth2 client
        this.oauth2_client = new OAuth2(
            this.credidentials.installed.client_id,
            this.credidentials.installed.client_secret,
            this.credidentials.installed.redirect_uris[0],
        );

        // Load user token
        let token_json = await (
            fs.existsSync(this.token_path) ?
                fs.promises.readFile(this.token_path)
                : this.get_new_token()
        );

        // Parse token and get authorized scopes
        let token = JSON.parse(token_json);
        let token_scopes = token.scope.split(' ');

        // Check if any scopes are missing
        for (let i = 0; i < this.scopes.length; i++) {
            // If so, have the user re-authorize
            if (!token_scopes.includes(this.scopes[i])) {
                console.log("New scopes have been added!")
                token = JSON.parse(await this.get_new_token());
            }
        }

        // Save the token
        this.oauth2_client.credentials = token;
        this.service = google.youtube('v3');
        this.authorized = true;
    }

    get_channels(channel_name) {
        if (!this.authorized) throw "Youtube API is not authorized! Please call .authorize() before making any API calls.";

        return new Promise((resolve, reject) => {
            this.service.channels.list({
                auth: this.oauth2_client,
                part: 'snippet,contentDetails,statistics',
                forUsername: channel_name
            }, function (err, response) {
                if (err) {
                    console.log('The API returned an error: ' + err);
                    reject("API returned error");
                }

                const data = response.data;

                // No channel found
                if (data.pageInfo.totalResults === 0) {
                    console.log("No channels found");
                    resolve([]);
                }

                resolve(response.data.items);
            });
        }
        )
    };

    /**
     * Upload a video to your youtube channel
     * @param {string} video_path - Path to the video file to upload
     * 
     * @param {object} info - Information regarding the youtube video
     * @param {string} info.title - The title of the video
     * @param {string} info.description - The description of the video
     * 
     * @returns {Promise}
     */
    upload_video(video_path, info) {
        if (!this.authorized) throw "Youtube API is not authorized! Please call .authorize() before making any API calls.";

        return new Promise((resolve, reject) => {
            console.log("Uploading", video_path);

            this.service.videos.insert({
                auth: this.oauth2_client,
                part: 'snippet,status',
                requestBody: {
                    snippet: {
                        title: info.title,
                        description: info.description,
                    },
                    status: {
                        privacyStatus: 'unlisted'
                    }
                },
                media: {
                    body: fs.createReadStream(video_path)
                }
            }, (err, response) => {
                if (err) throw err;

                console.log(`Uploaded`);
                resolve(response.data);
            });
        });
    }
}