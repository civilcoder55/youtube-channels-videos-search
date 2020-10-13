function toggleDemo() {
  halfmoon.toggleDarkMode();
}
function alert() {
  halfmoon.initStickyAlert({
    content: "Enter a valid channel url https://www.youtube.com/c/{name}",
    title: "Channel URL Invalid",
    alertType: "alert-danger",
    fillType: "filled",
  });
}
function createVideoCard(video) {
  const colDiv = document.createElement("div");
  colDiv.className = "col-md-3";
  colDiv.id = video.id.videoId;

  const wDiv = document.createElement("div");
  wDiv.className = "w-400 mw-full";

  const cardDiv = document.createElement("div");
  cardDiv.className = "card p-0 h-300";

  const contentDiv = document.createElement("div");

  const h5 = document.createElement("h5");
  h5.className = "text-center";
  h5.textContent = video.snippet.title;

  const link = document.createElement("a");
  link.setAttribute("target", "_blank");
  link.href = `https://www.youtube.com/watch?v=${video.id.videoId}`;

  const img = document.createElement("img");
  const imageRes = video.snippet.thumbnails.standard || video.snippet.thumbnails.medium || video.snippet.thumbnails.high;
  img.src = imageRes.url;
  img.className = "img-fluid rounded";
  img.style.width = "-webkit-fill-available";

  link.appendChild(h5);
  contentDiv.appendChild(link);
  cardDiv.appendChild(img);
  cardDiv.appendChild(contentDiv);
  wDiv.appendChild(cardDiv);
  colDiv.appendChild(wDiv);

  return colDiv;
}
allVideos = [];
videosContainer = document.getElementById("videos");
loading = document.getElementById("loading");
document.getElementById("search").addEventListener("click", (e) => {
  e.preventDefault();
  loading.style.visibility = "visible";
  videosContainer.innerHTML = "";
  

  link = document.getElementById("link").value;
  fetch(`http://localhost:5000/videos?link=${link}`)
    .then((response) => response.json())
    .then((res) => {
      if (res.error) {
        alert();
        document.getElementById("filter").disabled = true;
      } else {
        loading.style.visibility = "hidden";
        allVideos = [];
        document.getElementById("filter").disabled = false;
        res.forEach((video) => {
          try {
            if (video.id.kind != "youtube#video") {
              return;
            }
            const videoElement = createVideoCard(video);
            videosContainer.appendChild(videoElement);
            el = {};
            el["title"] = video.snippet.title;
            el["div"] = videoElement;
            allVideos.push(el);
          } catch {
            return;
          }
        });
      }
    });
});

document.getElementById("filter").addEventListener("input", (e) => {
  const regExp = new RegExp(e.target.value, "gi");
  videosContainer.innerHTML = "";
  allVideos.forEach((video) => {
    if (video.title.match(regExp)) {
      videosContainer.appendChild(video.div);
    }
  });
});