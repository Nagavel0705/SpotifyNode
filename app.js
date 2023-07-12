const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config();
const SpotifyWebApi = require("spotify-web-api-node");
const youtube = require('@googleapis/youtube').youtube('v3');
const mongoose = require("mongoose");

mongoose.connect("mongodb://127.0.0.1:27017/spotifyDB");

let global_email = ""; // STORING THE CURRENT USER'S EMAIL GLOBALLY FOR ACCESS IN ALL ROUTES

const User = mongoose.model("User", {
  email: String,
  id: String,
  accessToken: String,
  refreshToken: String,
});

const app = express();
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));

const scopes = [
  "ugc-image-upload",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "streaming",
  "app-remote-control",
  "user-read-email",
  "user-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-read-private",
  "playlist-modify-private",
  "user-library-modify",
  "user-library-read",
  "user-top-read",
  "user-read-playback-position",
  "user-read-recently-played",
  "user-follow-read",
  "user-follow-modify",
];

const youtubeKey = process.env.YOUTUBE_KEY;

const spotifyApi = new SpotifyWebApi({
  redirectUri: "http://localhost:3000/callback",
  clientId: process.env.clientID,
  clientSecret: process.env.clientSecret,
});
// AUTHORIZATION OF THE USER

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.get("/login", (req, res) => {
  res.redirect(spotifyApi.createAuthorizeURL(scopes));
});

app.get("/callback", (req, res) => {
  const error = req.query.error;
  const code = req.query.code;
  const state = req.query.state;

  if (error) {
    console.error("Callback Error:", error);
    res.send(`Callback Error: ${error}`);
    return;
  }

  spotifyApi
    .authorizationCodeGrant(code)
    .then(async (data) => {
      // console.log(data);
      const access_token = data.body["access_token"];
      const refresh_token = data.body["refresh_token"];
      const expires_in = data.body["expires_in"];

      spotifyApi.setAccessToken(access_token);
      spotifyApi.setRefreshToken(refresh_token);

      console.log(
        `Sucessfully retreived access token. Expires in ${expires_in} s.`
      );

      try {
        const me = await spotifyApi.getMe();

        global_email = me.body.email;

        // console.log(me);

        const user = new User({
          email: global_email,
          id: me.body.id,
          accessToken: access_token,
          refreshToken: refresh_token,
        });

        user.save();

        res.render("welcome", { name: me.body["display_name"] });
      } catch (e) {
        console.error(e);
      }

      setInterval(async () => {
        const data = await spotifyApi.refreshAccessToken();
        const access_token = data.body["access_token"];

        console.log("The access token has been refreshed!");
        console.log("access_token:", access_token);
        spotifyApi.setAccessToken(access_token);

        await User.findOneAndUpdate(
          { email: global_email },
          { accessToken: access_token }
        );
      }, 3600000);
    })
    .catch((error) => {
      console.error("Error getting Tokens:", error);
      res.send(`Error getting Tokens: ${error}`);
    });
});

app.post("/myPlaylists", async function (req, res) {
  const user = await User.findOne({ email: global_email });

  const data = await spotifyApi.getUserPlaylists(user.id);

  console.log("---------------+++++++++++++++++++++++++");
  let playlists = [];

  // console.log(JSON.stringify(data, null, 4));

  for (let playlist of data.body.items) {
    playlists.push([playlist.images[0].url, playlist.name, playlist.id]);
  }

  // console.log(playlists);

  res.render("MyPlaylists", { playlists: playlists });
});

app.post("/getUserPlaylistSongs", async function (req, res) {
  const playlistID = req.body.playlistId;
  playlistName = req.body.playlistName;
  playlistImg = req.body.playlistImg;

  tracks = [];

  const trackData = await spotifyApi.getPlaylistTracks(playlistID);

  // console.log(JSON.stringify(trackData, null, 4));

  for (let song of trackData.body.items) {
    if (!song.track.album.images[0]) {
      tracks.push([song.track.name, "Spotify_App_Logo.svg.png", []]);
    } else {
      tracks.push([song.track.name, song.track.album.images[0].url, []]);
    }
    for (let artist of song.track.artists) {
      tracks[tracks.length - 1][2].push(artist.name);
    }
  }

  // console.log(tracks);
  console.log(playlistName, playlistID);
  res.render("MyPlaylistTracks", { playlistImg: playlistImg, playlistName: playlistName, tracks: tracks });
});

app.post("/convertPlaylistToYoutube", async function (req, res) {
  let youtubePlaylist = [];
  for (const track of tracks) {
    if (track[1] === "Spotify_App_Logo.svg.png") {
      continue;
    }
    try {
      const response = await youtube.search.list({
        key: youtubeKey,
        part: 'snippet',
        q: track[0] + " " + track[2][0],
      });
      
      const url = `https://www.youtube.com/watch?v=${response.data.items[0].id.videoId}`;
      const videoName = response.data.items[0].snippet.title;
      const channelTitle = response.data.items[0].snippet.channelTitle;
      const thumbnail = response.data.items[0].snippet.thumbnails.high.url;
      youtubePlaylist.push([url, videoName, channelTitle, thumbnail]);
    } catch (err) {
      console.error(err);
    }
  }

  console.log(youtubePlaylist);

  res.render('ConvertedYoutubePlaylist', {playlistImg: playlistImg, playlistName: playlistName, youtubePlaylist: youtubePlaylist});

});

app.post("/convertTrackToYoutube", async function (req, res) {
  const songName = req.body.songName;

  youtube.search.list({
    key: youtubeKey,
    part: 'snippet',
    q: songName,
  }).then((response) => {
    console.log(JSON.stringify(response,null,4));
    res.render('ConvertedYoutubeSongs', {videoID: response.data.items[0].id.videoId});
  }).catch((err) => {
    console.error(err);
  });
});

app.listen(3000, () =>
  console.log(
    "HTTP Server up. Now go to http://localhost:3000 in your browser."
  )
);