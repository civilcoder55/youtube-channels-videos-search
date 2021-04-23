// reqired modules
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const fetch = require("node-fetch");
const responseTime = require("response-time");
const { promisify } = require("util");
const redis = require("redis");

// set up .env variables
require("dotenv").config();

// set up redis client
const client = redis.createClient({
  host: "127.0.0.1",
  port: 6379,
});

// Make redis get and set as Async Func
const GET_R = promisify(client.get).bind(client);
const SET_R = promisify(client.set).bind(client);

// set up express app
const app = express();
app.use(morgan("tiny"));
app.use(cors());
app.use(responseTime());

const getChannelId = (link) => {
  //check if link is a valid youtube channel link
  var Regexp = /^(?:http)s?:\/\/(?:www.)?youtube.com\/c\/([a-zA-Z0-9\-]+)/g;
  var valid = Regexp.exec(link);
  if (!valid) {
    return null;
  }
  // if valid then extract the channel id from html page (there are different methods to get this id)
  return fetch(link)
    .then((response) => response.text())
    .then((response) => {
      var Regexp = /"channelId" content="([a-zA-Z0-9_\-]+)"/g;
      var match = Regexp.exec(response);
      if (!match) {
        return null;
      }
      return match[1];
    });
};

const getVideos = (channelId, pageToken) => {
  const playlistId = channelId.substr(0, 1) + "U" + channelId.substr(2);
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?key=${
    process.env.GOOGLE_API_KEY
  }&playlistId=${playlistId}&part=snippet,contentDetails&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ""}`;
  return fetch(url).then((response) => response.json());
};

app.get("/videos", async (req, res, next) => {
  let channelId = await getChannelId(req.query.link);

  if (!channelId) {
    const error = new Error("invalid channel");
    return next(error);
  }

  // check if channelId has cached data or not
  const cachedData = await GET_R(channelId);
  if (cachedData) {
    res.json(JSON.parse(cachedData));
    return;
  }

  // else continue fetching data
  let page = await getVideos(channelId);
  if (page.error) {
    res.json({ message: page.error.message });
    return;
  }
  let videos = page.items;
  while (page.nextPageToken) {
    page = await getVideos(channelId, page.nextPageToken);
    videos = videos.concat(page.items);
  }

  // save data in redis as cache
  const cacheData = await SET_R(
    channelId,
    JSON.stringify(videos),
    "EX",
    3600 // set expiring time to one hour as example
  );
  res.json(videos);
});

app.use((req, res, next) => {
  res.status(404);
  next(new Error("Not Found"));
});
app.use((error, req, res, next) => {
  res.status(res.statusCode || 500);
  res.json({
    error: error.message,
  });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log("Listening on port", port);
});
