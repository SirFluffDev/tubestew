import fs from 'fs';
import readline from 'readline';

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
const OAuth2 = google.auth.OAuth2;

export const VIDEO_CATEGORIES = {
    "FILM_AND_ANIMATION": "1",
    "AUTOS_AND_VEHICLES": "2",
    "MUSIC": "10",
    "PETS_AND_ANIMALS": "15",
    "SPORTS": "17",
    "TRAVEL_AND_EVENTS": "19",
    "GAMING": "20",
    "PEOPLE_AND_BLOGS": "22",
    "COMEDY": "23",
    "ENTERTAINMENT": "24",
    "NEWS_AND_POLITICS": "25",
    "HOWTO_AND_STYLE": "26",
    "EDUCATION": "27",
    "SCIENCE_AND_TECHNOLOGY": "28",
    "NONPROFITS_AND_ACTIVISM": "29"
}

export const SCOPES = {
    UPLOAD: 'https://www.googleapis.com/auth/youtube.upload',
}

/**
 * Simple abstraction over the Youtube API
 * @property {string} client_secret_path
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

    async get_categories() {
        if (!this.authorized) throw "Youtube API is not authorized! Please call .authorize() before making any API calls.";

        const res = await this.service.videoCategories.list({
             auth: this.oauth2_client, 

             part: 'snippet',
             regionCode: 'US',
        });

        return res.data.items;
    }

    /**
     * Upload a video to your youtube channel
     * @param {string} video_path - Path to the video file to upload
     * 
     * @param {object} video_data - Video information
     * 
     * @param {object} video_data.snippet
     * @param {string} video_data.snippet.title - The title of the video
     * @param {string} video_data.snippet.description - The description of the video
     * @param {string} video_data.snippet.defaultLanguage - The language of the video
     * @param {string} video_data.snippet.categoryId - The category of the video
     * 
     * @param {object} video_data.status
     * @param {('public'|'unlisted'|'private')} video_data.status.privacyStatus - Privacy status of the video
     * 
     * @param {string} video_data.status.publishAt - 
     * When to publish the video [(ISO 8601 format)](https://www.w3.org/TR/NOTE-datetime)
     * Note that this only applies if `status.privacyStatus` is private.
     * 
     * @param {('youtube'|'creativeCommon')} video_data.status.license - The video's license
     * @param {boolean} video_data.status.embeddable - Whether the video can be embedded on other sites or not
     * @param {boolean} video_data.status.selfDeclaredMadeForKids - Whether the video is made for kids or not
     * 
     * @returns {Promise}
     */
    upload_video(video_path, video_data) {
        if (!this.authorized) throw "Youtube API is not authorized! Please call .authorize() before making any API calls.";

        return new Promise((resolve, reject) => {
            this.service.videos.insert({
                auth: this.oauth2_client,
                part: 'snippet,status,id',

                requestBody: video_data,

                media: {
                    body: fs.createReadStream(video_path)
                }
            }, (err, response) => {
                if (err) reject(err);
                resolve(response.data);
            });
        });
    }
}