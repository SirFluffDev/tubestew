import { Youtube } from "./youtube.mjs";
import readline from 'readline';

const SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.upload',
];

const youtube = new Youtube(
    './youtube/client_secret.json',
    './youtube/api_key.json',
    './youtube/user_token.json',
    SCOPES
);

await youtube.authorize();

const channels = await youtube.get_channels('GoogleDevelopers');
console.log(channels[0].snippet.title);