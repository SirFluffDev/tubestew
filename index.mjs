import { Youtube } from "./youtube.mjs";

const SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.upload',
];

const youtube = new Youtube('./youtube/', SCOPES);
await youtube.authorize();

await youtube.upload_video('./video.mp4', "Amazing Joke Compilation (TEST)");

const channels = await youtube.get_channels('GoogleDevelopers');
console.log(channels[0].snippet.title, 'has', channels[0].statistics.viewCount, 'views');