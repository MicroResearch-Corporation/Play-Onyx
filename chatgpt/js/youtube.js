
let ytPlayer;
const ytInput = document.getElementById("ytUrl");
const loadYT = document.getElementById("loadYT");

function onYouTubeIframeAPIReady() {
  ytPlayer = new YT.Player('ytPlayer', {
    height: '360',
    width: '100%',
    videoId: '',
    events: {}
  });
}

loadYT.onclick = () => {
  const id = ytInput.value.split("v=")[1];
  if (id && ytPlayer) ytPlayer.loadVideoById(id);
};
