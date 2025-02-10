const socket = io.connect("https://meet.daarolquran.com");
const myvideo = document.querySelector("#vd1");
const roomid = new URLSearchParams(window.location.search).get("room");
let username;
const chatRoom = document.querySelector(".chat-cont");
const sendButton = document.querySelector(".chat-send");
const messageField = document.querySelector(".chat-input");
const videoContainer = document.querySelector("#vcont");
const overlayContainer = document.querySelector("#overlay");
const continueButt = document.querySelector(".continue-name");
const nameField = document.querySelector("#name-field");
const videoButt = document.querySelector(".novideo");
const audioButt = document.querySelector(".audio");
const cutCall = document.querySelector(".cutcall");
const screenShareButt = document.querySelector(".screenshare");
const whiteboardButt = document.querySelector(".board-icon");

let videoAllowed = true;
let audioAllowed = true;
let screenshareEnabled = false;
let boardVisible = false;

let micInfo = {};
let videoInfo = {};

let audioTrackSent = {};
let videoTrackSent = {};

let mystream, myscreenshare;

// Coturn Server Configuration
const turnServerAddress = "156.253.5.46"; // Replace with your server's public IP or domain
const turnSecret = "mysecret"; // The same secret from Coturn's config file
const turnRealm = turnServerAddress;

// Generate dynamic TURN credentials
function generateTurnCredentials(secret, realm) {
  const unixTime = Math.floor(Date.now() / 1000) + 24 * 3600; // Valid for 24 hours
  const username = `${unixTime}`;
  const hmac = CryptoJS.HmacSHA1(username, secret); // Generate HMAC using the secret
  const credential = CryptoJS.enc.Base64.stringify(hmac); // Base64 encode the result
  return { username, credential };
}

const turnCredentials = generateTurnCredentials(turnSecret, turnRealm);

// WebRTC ICE Configuration with Coturn Server
const configuration = {
  iceServers: [
    {
      urls: `stun:${turnServerAddress}:3478`, // Your Coturn STUN server
    },
    {
      urls: `turn:${turnServerAddress}:3478`, // Your Coturn TURN server
      username: turnCredentials.username, // Dynamic TURN username
      credential: turnCredentials.credential, // Dynamic TURN credential
    },
  ],
};

const mediaConstraints = { video: true, audio: true };

let connections = {};
let cName = {};

// User login and room join
continueButt.addEventListener("click", () => {
  if (nameField.value === "") return;
  username = nameField.value;
  overlayContainer.style.visibility = "hidden";
  document.querySelector("#myname").innerHTML = `${username} (You)`;
  socket.emit("join room", roomid, username);
});

nameField.addEventListener("keyup", function (event) {
  if (event.keyCode === 13) {
    event.preventDefault();
    continueButt.click();
  }
});

// Start video call
function startCall() {
  navigator.mediaDevices
    .getUserMedia(mediaConstraints)
    .then((localStream) => {
      myvideo.srcObject = localStream;
      myvideo.muted = true;
      mystream = localStream;
      localStream.getTracks().forEach((track) => {
        for (let key in connections) {
          connections[key].addTrack(track, localStream);
          if (track.kind === "audio") audioTrackSent[key] = track;
          else videoTrackSent[key] = track;
        }
      });
    })
    .catch(handleGetUserMediaError);
}

function handleGetUserMediaError(e) {
  console.log(e);
  switch (e.name) {
    case "NotFoundError":
      alert("No camera and/or microphone found.");
      break;
    case "SecurityError":
    case "PermissionDeniedError":
      break;
    default:
      alert(`Error opening your camera and/or microphone: ${e.message}`);
      break;
  }
}

// Handle incoming video offer
function handleVideoOffer(offer, sid, cname, micinf, vidinf) {
  cName[sid] = cname;
  console.log("Video offer received");
  micInfo[sid] = micinf;
  videoInfo[sid] = vidinf;
  connections[sid] = new RTCPeerConnection(configuration);

  connections[sid].onicecandidate = function (event) {
    if (event.candidate) {
      socket.emit("new icecandidate", event.candidate, sid);
    }
  };

  connections[sid].ontrack = function (event) {
    if (!document.getElementById(sid)) {
      let vidCont = document.createElement("div");
      let newvideo = document.createElement("video");
      let name = document.createElement("div");
      let muteIcon = document.createElement("div");
      let videoOff = document.createElement("div");

      videoOff.classList.add("video-off");
      muteIcon.classList.add("mute-icon");
      name.classList.add("nametag");
      name.innerHTML = `${cName[sid]}`;
      vidCont.id = sid;
      muteIcon.id = `mute${sid}`;
      videoOff.id = `vidoff${sid}`;
      muteIcon.innerHTML = `<i class="fas fa-microphone-slash"></i>`;
      videoOff.innerHTML = "Video Off";
      vidCont.classList.add("video-box");
      newvideo.classList.add("video-frame2");
      newvideo.autoplay = true;
      newvideo.playsinline = true;
      newvideo.id = `video${sid}`;
      newvideo.srcObject = event.streams[0];

      if (micInfo[sid] === "on") muteIcon.style.visibility = "hidden";
      else muteIcon.style.visibility = "visible";

      if (videoInfo[sid] === "on") videoOff.style.visibility = "hidden";
      else videoOff.style.visibility = "visible";

      vidCont.appendChild(newvideo);
      vidCont.appendChild(name);
      vidCont.appendChild(muteIcon);
      vidCont.appendChild(videoOff);

      videoContainer.appendChild(vidCont);
    }
  };

  connections[sid].onnegotiationneeded = function () {
    connections[sid]
      .createOffer()
      .then(function (offer) {
        return connections[sid].setLocalDescription(offer);
      })
      .then(function () {
        socket.emit("video-offer", connections[sid].localDescription, sid);
      })
      .catch(reportError);
  };

  let desc = new RTCSessionDescription(offer);

  connections[sid]
    .setRemoteDescription(desc)
    .then(() => navigator.mediaDevices.getUserMedia(mediaConstraints))
    .then((localStream) => {
      localStream.getTracks().forEach((track) => {
        connections[sid].addTrack(track, localStream);
        if (track.kind === "audio") {
          audioTrackSent[sid] = track;
        } else {
          videoTrackSent[sid] = track;
        }
      });
    })
    .then(() => connections[sid].createAnswer())
    .then((answer) => connections[sid].setLocalDescription(answer))
    .then(() =>
      socket.emit("video-answer", connections[sid].localDescription, sid)
    )
    .catch(handleGetUserMediaError);
}

// Handle new ICE candidate
function handleNewIceCandidate(candidate, sid) {
  const newCandidate = new RTCIceCandidate(candidate);
  connections[sid].addIceCandidate(newCandidate).catch(reportError);
}

// Handle video answer
function handleVideoAnswer(answer, sid) {
  const desc = new RTCSessionDescription(answer);
  connections[sid].setRemoteDescription(desc);
}

function reportError(e) {
  console.log(e);
  return;
}

// Handle messages and other events
sendButton.addEventListener("click", () => {
  const msg = messageField.value;
  messageField.value = "";
  socket.emit("message", msg, username, roomid);
});

socket.on("message", (msg, sendername, time) => {
  chatRoom.scrollTop = chatRoom.scrollHeight;
  chatRoom.innerHTML += `
    <div class="message">
      <div class="info">
        <div class="username">${sendername}</div>
        <div class="time">${time}</div>
      </div>
      <div class="content">${msg}</div>
    </div>`;
});

// Mute/Unmute Audio
audioButt.addEventListener("click", () => {
  if (audioAllowed) {
    Object.values(audioTrackSent).forEach((track) => (track.enabled = false));
    audioButt.innerHTML = `<i class="fas fa-microphone-slash"></i>`;
    audioAllowed = false;
    audioButt.style.backgroundColor = "#b12c2c";
    socket.emit("action", "mute");
  } else {
    Object.values(audioTrackSent).forEach((track) => (track.enabled = true));
    audioButt.innerHTML = `<i class="fas fa-microphone"></i>`;
    audioAllowed = true;
    audioButt.style.backgroundColor = "#4ECCA3";
    socket.emit("action", "unmute");
  }
});

// Enable/Disable Video
videoButt.addEventListener("click", () => {
  if (videoAllowed) {
    Object.values(videoTrackSent).forEach((track) => (track.enabled = false));
    videoButt.innerHTML = `<i class="fas fa-video-slash"></i>`;
    videoAllowed = false;
    videoButt.style.backgroundColor = "#b12c2c";
    myvideooff.style.visibility = "visible";
    socket.emit("action", "videooff");
  } else {
    Object.values(videoTrackSent).forEach((track) => (track.enabled = true));
    videoButt.innerHTML = `<i class="fas fa-video"></i>`;
    videoAllowed = true;
    videoButt.style.backgroundColor = "#4ECCA3";
    myvideooff.style.visibility = "hidden";
    socket.emit("action", "videoon");
  }
});

// Screen Sharing
screenShareButt.addEventListener("click", () => {
  screenShareToggle();
});

function screenShareToggle() {
  let screenMediaPromise;
  if (!screenshareEnabled) {
    if (navigator.getDisplayMedia) {
      screenMediaPromise = navigator.getDisplayMedia({ video: true });
    } else if (navigator.mediaDevices.getDisplayMedia) {
      screenMediaPromise = navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
    } else {
      screenMediaPromise = navigator.mediaDevices.getUserMedia({
        video: { mediaSource: "screen" },
      });
    }
  } else {
    screenMediaPromise = navigator.mediaDevices.getUserMedia({ video: true });
  }

  screenMediaPromise
    .then((stream) => {
      screenshareEnabled = !screenshareEnabled;
      for (let key in connections) {
        const sender = connections[key]
          .getSenders()
          .find((s) => (s.track ? s.track.kind === "video" : false));
        sender.replaceTrack(stream.getVideoTracks()[0]);
      }
      mystream = stream;
      myvideo.srcObject = mystream;
      myvideo.muted = true;
      screenShareButt.innerHTML = screenshareEnabled
        ? `<i class="fas fa-desktop"></i><span class="tooltiptext">Stop Sharing</span>`
        : `<i class="fas fa-desktop"></i><span class="tooltiptext">Share Screen</span>`;
      stream.getVideoTracks()[0].onended = function () {
        if (screenshareEnabled) screenShareToggle();
      };
    })
    .catch((e) => {
      alert("Unable to share screen:" + e.message);
      console.error(e);
    });
}

// Whiteboard Toggle
whiteboardButt.addEventListener("click", () => {
  boardVisible = !boardVisible;
  document.querySelector(".whiteboard-cont").style.visibility = boardVisible
    ? "visible"
    : "hidden";
});

// Handle actions like muting/unmuting and video on/off
socket.on("action", (msg, sid) => {
  if (msg === "mute") {
    document.querySelector(`#mute${sid}`).style.visibility = "visible";
    micInfo[sid] = "off";
  } else if (msg === "unmute") {
    document.querySelector(`#mute${sid}`).style.visibility = "hidden";
    micInfo[sid] = "on";
  } else if (msg === "videooff") {
    document.querySelector(`#vidoff${sid}`).style.visibility = "visible";
    videoInfo[sid] = "off";
  } else if (msg === "videoon") {
    document.querySelector(`#vidoff${sid}`).style.visibility = "hidden";
    videoInfo[sid] = "on";
  }
});

// Handle ICE candidates, video offers, and answers
socket.on("video-offer", handleVideoOffer);
socket.on("new icecandidate", handleNewIceCandidate);
socket.on("video-answer", handleVideoAnswer);
