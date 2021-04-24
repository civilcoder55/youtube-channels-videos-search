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

const getChannelInfo = (link) => {
  //check if link is a valid youtube channel link
  var Regexp = /^(?:http)s?:\/\/(?:www.)?youtube.com\/c\/([a-zA-Z0-9\-]+)/g;
  var valid = Regexp.exec(link);
  if (!valid) {
    return null;
  }
  // if valid then extract the channel id and from html page (there are different methods to get this id)
  return fetch(link + "/about?hl=en")
    .then((response) => response.text())
    .then((response) => {
      let channelIdRegex = /"channelId" content="([a-zA-Z0-9_\-]+)"/g;
      let channelIdMatch = channelIdRegex.exec(response);
      if (!channelIdMatch) {
        return null;
      }
      let channelId = channelIdMatch[1];
      let playlistId = channelId.substr(0, 1) + "U" + channelId.substr(2);
      return {
        channelId,
        playlistId,
      };
    });
};

const getVideos = ({ playlistId, pageToken, maxResults }) => {
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?key=${
    process.env.GOOGLE_API_KEY
  }&playlistId=${playlistId}&part=snippet,contentDetails&maxResults=${maxResults}${pageToken ? `&pageToken=${pageToken}` : ""}`;
  return fetch(url).then((response) => response.json());
};

app.get("/videos", async (req, res, next) => {
  let channelInfo = await getChannelInfo(req.query.link);
  if (!channelInfo) {
    return next(new Error("invalid channel"));
  }

  // check if channelId has cached data or not
  const cachedData = await GET_R(channelInfo.channelId);
  if (cachedData) {
    let page = await getVideos({ playlistId: channelInfo.playlistId, pageToken: null, maxResults: 0 });
    let parsedCachedData = JSON.parse(cachedData);
    if (page.pageInfo.totalResults == parsedCachedData.totalResults) {
      console.log("Get " + parsedCachedData.totalResults + " Cached Video/s");
      return res.json(parsedCachedData.videos);
    }

    // if new videos less than 1 page of 50 then get these videos and recache
    let videos = parsedCachedData.videos;
    let newVideos = page.pageInfo.totalResults - parsedCachedData.totalResults;
    if (newVideos <= 50) {
      page = await getVideos({ playlistId: channelInfo.playlistId, pageToken: null, maxResults: newVideos });
      videos = videos.concat(page.items);
      await SET_R(
        channelInfo.channelId,
        JSON.stringify({
          totalResults: page.pageInfo.totalResults,
          videos,
        })
      );
      console.log("Get " + parsedCachedData.totalResults + " Cached Video/s && " + newVideos + " New Video/s");
      return res.json(videos);
    }
  }

  // else fetch all videos and cache them
  let page = await getVideos({ playlistId: channelInfo.playlistId, pageToken: null, maxResults: 50 });
  if (page.error) {
    return res.json({
      message: page.error.message,
    });
  }
  let videos = page.items;
  while (page.nextPageToken) {
    page = await getVideos({ playlistId: channelInfo.playlistId, pageToken: page.nextPageToken, maxResults: 50 });
    videos = videos.concat(page.items);
  }

  // save data in redis as cache
  await SET_R(
    channelInfo.channelId,
    JSON.stringify({
      totalResults: page.pageInfo.totalResults,
      videos,
    })
  );
  console.log("Get " + page.pageInfo.totalResults + " New Video/s");
  return res.json(videos);
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
