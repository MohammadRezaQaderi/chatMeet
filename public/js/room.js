const socket = io.connect("https://meet.daarolquran.com");
const params = new URLSearchParams(location.search);
const roomid = params.get("room");
const role = params.get("role");
let username = params.get("name");

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
const myvideo = document.querySelector("#vd1");
const mymuteicon = document.querySelector("#mymuteicon");
const myvideooff = document.querySelector("#myvideooff");
const whiteboardCont = document.querySelector(".whiteboard-cont");
const canvas = document.querySelector("#whiteboard");
const ctx = canvas.getContext("2d");

if (!roomid) location.href = "/";

let videoAllowed = role === "teacher";
let audioAllowed = role === "teacher";

mymuteicon.style.visibility = audioAllowed ? "hidden" : "visible";
myvideooff.style.visibility = videoAllowed ? "hidden" : "visible";

if (username) {
  overlayContainer.style.visibility = "hidden";
  document.querySelector("#myname").innerHTML = `${username} (You)`;
  socket.emit("join room", roomid, username, role);
} else {
  continueButt.addEventListener("click", () => {
    if (nameField.value === "") return;
    username = nameField.value;
    overlayContainer.style.visibility = "hidden";
    document.querySelector("#myname").innerHTML = `${username} (You)`;
    socket.emit("join room", roomid, username, role);
  });
}

let boardVisisble = false;

whiteboardCont.style.visibility = "hidden";

let isDrawing = 0;
let x = 0;
let y = 0;
let color = "black";
let drawsize = 3;
let colorRemote = "black";
let drawsizeRemote = 3;

function fitToContainer(canvas) {
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}

const mediaConstraints = {
  video: videoAllowed,
  audio: audioAllowed,
};

if (role === "student") {
  videoButt.style.opacity = "0.5";
  videoButt.style.pointerEvents = "none";
  audioButt.style.opacity = "0.5";
  audioButt.style.pointerEvents = "none";
}

fitToContainer(canvas);

//getCanvas call is under join room call
socket.on("getCanvas", (url) => {
  let img = new Image();
  img.onload = start;
  img.src = url;

  function start() {
    ctx.drawImage(img, 0, 0);
  }

  console.log("got canvas", url);
});

function setColor(newcolor) {
  color = newcolor;
  drawsize = 3;
}

function setEraser() {
  color = "white";
  drawsize = 10;
}

//might remove this
function reportWindowSize() {
  fitToContainer(canvas);
}

window.onresize = reportWindowSize;
//

function clearBoard() {
  if (
    window.confirm(
      "Are you sure you want to clear board? This cannot be undone"
    )
  ) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit("store canvas", canvas.toDataURL());
    socket.emit("clearBoard");
  } else return;
}

socket.on("clearBoard", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

function draw(newx, newy, oldx, oldy) {
  ctx.strokeStyle = color;
  ctx.lineWidth = drawsize;
  ctx.beginPath();
  ctx.moveTo(oldx, oldy);
  ctx.lineTo(newx, newy);
  ctx.stroke();
  ctx.closePath();

  socket.emit("store canvas", canvas.toDataURL());
}

function drawRemote(newx, newy, oldx, oldy) {
  ctx.strokeStyle = colorRemote;
  ctx.lineWidth = drawsizeRemote;
  ctx.beginPath();
  ctx.moveTo(oldx, oldy);
  ctx.lineTo(newx, newy);
  ctx.stroke();
  ctx.closePath();
}

canvas.addEventListener("mousedown", (e) => {
  x = e.offsetX;
  y = e.offsetY;
  isDrawing = 1;
});

canvas.addEventListener("mousemove", (e) => {
  if (isDrawing) {
    draw(e.offsetX, e.offsetY, x, y);
    socket.emit("draw", e.offsetX, e.offsetY, x, y, color, drawsize);
    x = e.offsetX;
    y = e.offsetY;
  }
});

window.addEventListener("mouseup", (e) => {
  if (isDrawing) {
    isDrawing = 0;
  }
});

socket.on("draw", (newX, newY, prevX, prevY, color, size) => {
  colorRemote = color;
  drawsizeRemote = size;
  drawRemote(newX, newY, prevX, prevY);
});

let micInfo = {};
let videoInfo = {};

let videoTrackReceived = {};

mymuteicon.style.visibility = "hidden";

myvideooff.style.visibility = "hidden";

function generateTurnCredentials(secret, realm) {
  const unixTime = Math.floor(Date.now() / 1000) + 24 * 3600; // Valid for 24 hours
  const username = `${unixTime}`; // Username is the expiry time
  const hmac = CryptoJS.HmacSHA1(username, secret); // Generate HMAC using the secret
  const credential = CryptoJS.enc.Base64.stringify(hmac); // Base64 encode the result
  return { username, credential };
}

const turnServerAddress = "156.253.5.46"; // Your TURN server's public IP or domain
const turnSecret = "mysecret"; // The shared secret from Coturn config
const turnRealm = turnServerAddress; // The realm, same as Coturn server-name

// Generate dynamic credentials
const turnCredentials = generateTurnCredentials(turnSecret, turnRealm);

// Updated WebRTC ICE Configuration
const configuration = {
  iceServers: [
    {
      urls: `stun:${turnServerAddress}:3478`, // STUN server (non-secure)
    },
    {
      urls: `turns:${turnServerAddress}:5349`, // Secure TURN server (over TLS)
      username: turnCredentials.username, // Dynamic username
      credential: turnCredentials.credential, // Dynamic credential
    },
  ],
};

let connections = {};
let cName = {};
let audioTrackSent = {};
let videoTrackSent = {};

let mystream, myscreenshare;

// document.querySelector(".roomcode").innerHTML = `${roomid}`;

function CopyClassText() {
  var textToCopy = document.querySelector(".roomcode");
  var currentRange;
  if (document.getSelection().rangeCount > 0) {
    currentRange = document.getSelection().getRangeAt(0);
    window.getSelection().removeRange(currentRange);
  } else {
    currentRange = false;
  }

  var CopyRange = document.createRange();
  CopyRange.selectNode(textToCopy);
  window.getSelection().addRange(CopyRange);
  document.execCommand("copy");

  window.getSelection().removeRange(CopyRange);

  if (currentRange) {
    window.getSelection().addRange(currentRange);
  }

  document.querySelector(".copycode-button").textContent = "Copied!";
  setTimeout(() => {
    document.querySelector(".copycode-button").textContent = "Copy Code";
  }, 5000);
}

continueButt.addEventListener("click", () => {
  if (nameField.value == "") return;
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

socket.on("user count", (count) => {
  if (count > 1) {
    videoContainer.className = "video-cont";
  } else {
    videoContainer.className = "video-cont-single";
  }
});

let peerConnection;

function handleGetUserMediaError(e) {
  switch (e.name) {
    case "NotFoundError":
      alert(
        "Unable to open your call because no camera and/or microphone" +
          "were found."
      );
      break;
    case "SecurityError":
    case "PermissionDeniedError":
      break;
    default:
      alert("Error opening your camera and/or microphone: " + e.message);
      break;
  }
}

function reportError(e) {
  console.log(e);
  return;
}

function startCall() {
  navigator.mediaDevices
    .getUserMedia(mediaConstraints)
    .then((localStream) => {
      myvideo.srcObject = localStream;
      myvideo.muted = true;

      if (role === "student") {
        localStream.getTracks().forEach((track) => {
          if (track.kind === "video") track.enabled = false;
          if (track.kind === "audio") track.enabled = false;
        });
      }
    })
    .catch(console.error);
}

function handleVideoOffer(offer, sid, cname, micinf, vidinf) {
  cName[sid] = cname;
  console.log("video offered recevied");
  micInfo[sid] = micinf;
  videoInfo[sid] = vidinf;
  connections[sid] = new RTCPeerConnection(configuration);

  connections[sid].onicecandidate = function (event) {
    if (event.candidate) {
      console.log("icecandidate fired");
      socket.emit("new icecandidate", event.candidate, sid);
    }
  };

  connections[sid].ontrack = function (event) {
    if (!document.getElementById(sid)) {
      console.log("track event fired");
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

      if (micInfo[sid] == "on") muteIcon.style.visibility = "hidden";
      else muteIcon.style.visibility = "visible";

      if (videoInfo[sid] == "on") videoOff.style.visibility = "hidden";
      else videoOff.style.visibility = "visible";

      vidCont.appendChild(newvideo);
      vidCont.appendChild(name);
      vidCont.appendChild(muteIcon);
      vidCont.appendChild(videoOff);

      videoContainer.appendChild(vidCont);
    }
  };

  connections[sid].onremovetrack = function (event) {
    if (document.getElementById(sid)) {
      document.getElementById(sid).remove();
      console.log("removed a track");
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
    .then(() => {
      return navigator.mediaDevices.getUserMedia(mediaConstraints);
    })
    .then((localStream) => {
      localStream.getTracks().forEach((track) => {
        connections[sid].addTrack(track, localStream);
        console.log("added local stream to peer");
        if (track.kind === "audio") {
          audioTrackSent[sid] = track;
          if (!audioAllowed) audioTrackSent[sid].enabled = false;
        } else {
          videoTrackSent[sid] = track;
          if (!videoAllowed) videoTrackSent[sid].enabled = false;
        }
      });
    })
    .then(() => {
      return connections[sid].createAnswer();
    })
    .then((answer) => {
      return connections[sid].setLocalDescription(answer);
    })
    .then(() => {
      socket.emit("video-answer", connections[sid].localDescription, sid);
    })
    .catch(handleGetUserMediaError);
}

function handleNewIceCandidate(candidate, sid) {
  console.log("new candidate recieved");
  var newcandidate = new RTCIceCandidate(candidate);

  connections[sid].addIceCandidate(newcandidate).catch(reportError);
}

function handleVideoAnswer(answer, sid) {
  console.log("answered the offer");
  const ans = new RTCSessionDescription(answer);
  connections[sid].setRemoteDescription(ans);
}

//Thanks to (https://github.com/miroslavpejic85) for ScreenShare Code

screenShareButt.addEventListener("click", () => {
  navigator.mediaDevices
    .getDisplayMedia({ video: true })
    .then((stream) => {
      let videoTrack = stream.getVideoTracks()[0];
      myvideo.srcObject = new MediaStream([videoTrack]);
      socket.emit("screen share", roomid);
    })
    .catch(console.error);
});
socket.on("video-offer", handleVideoOffer);

socket.on("new icecandidate", handleNewIceCandidate);

socket.on("video-answer", handleVideoAnswer);

socket.on("join room", async (conc, cnames, micinfo, videoinfo) => {
  socket.emit("getCanvas");
  if (cnames) cName = cnames;

  if (micinfo) micInfo = micinfo;

  if (videoinfo) videoInfo = videoinfo;

  console.log(cName);
  if (conc) {
    await conc.forEach((sid) => {
      connections[sid] = new RTCPeerConnection(configuration);

      connections[sid].onicecandidate = function (event) {
        if (event.candidate) {
          console.log("icecandidate fired");
          socket.emit("new icecandidate", event.candidate, sid);
        }
      };

      connections[sid].ontrack = function (event) {
        if (!document.getElementById(sid)) {
          console.log("track event fired");
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
          newvideo.classList.add("video-frame");
          newvideo.autoplay = true;
          newvideo.playsinline = true;
          newvideo.id = `video${sid}`;
          newvideo.srcObject = event.streams[0];

          if (micInfo[sid] == "on") muteIcon.style.visibility = "hidden";
          else muteIcon.style.visibility = "visible";

          if (videoInfo[sid] == "on") videoOff.style.visibility = "hidden";
          else videoOff.style.visibility = "visible";

          vidCont.appendChild(newvideo);
          vidCont.appendChild(name);
          vidCont.appendChild(muteIcon);
          vidCont.appendChild(videoOff);

          videoContainer.appendChild(vidCont);
        }
      };

      connections[sid].onremovetrack = function (event) {
        if (document.getElementById(sid)) {
          document.getElementById(sid).remove();
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
    });

    console.log("added all sockets to connections");
    startCall();
  } else {
    console.log("waiting for someone to join");
    navigator.mediaDevices
      .getUserMedia(mediaConstraints)
      .then((localStream) => {
        myvideo.srcObject = localStream;
        myvideo.muted = true;
        mystream = localStream;
      })
      .catch(handleGetUserMediaError);
  }
});

socket.on("remove peer", (sid) => {
  if (document.getElementById(sid)) {
    document.getElementById(sid).remove();
  }

  delete connections[sid];
});

sendButton.addEventListener("click", () => {
  const msg = messageField.value;
  messageField.value = "";
  socket.emit("message", msg, username, roomid);
});

messageField.addEventListener("keyup", (event) => {
  if (event.keyCode === 13) sendButton.click();
});

socket.on("message", (msg, sendername, time) => {
  chatRoom.innerHTML += `<div class="message">
      <div class="info">
          <div class="username">${sendername}</div>
          <div class="time">${time}</div>
      </div>
      <div class="content">${msg}</div>
  </div>`;
});

videoButt.addEventListener("click", () => {
  if (!videoAllowed) return;
  const enabled = myvideo.srcObject.getVideoTracks()[0].enabled;
  myvideo.srcObject.getVideoTracks()[0].enabled = !enabled;
  videoButt.innerHTML = enabled
    ? `<i class="fas fa-video-slash"></i>`
    : `<i class="fas fa-video"></i>`;
  myvideooff.style.visibility = enabled ? "visible" : "hidden";
  socket.emit("action", enabled ? "videooff" : "videoon");
});

audioButt.addEventListener("click", () => {
  if (!audioAllowed) return;
  const enabled = myvideo.srcObject.getAudioTracks()[0].enabled;
  myvideo.srcObject.getAudioTracks()[0].enabled = !enabled;
  audioButt.innerHTML = enabled
    ? `<i class="fas fa-microphone-slash"></i>`
    : `<i class="fas fa-microphone"></i>`;
  mymuteicon.style.visibility = enabled ? "visible" : "hidden";
  socket.emit("action", enabled ? "mute" : "unmute");
});

socket.on("action", (msg, sid) => {
  if (msg == "mute") {
    console.log(sid + " muted themself");
    document.querySelector(`#mute${sid}`).style.visibility = "visible";
    micInfo[sid] = "off";
  } else if (msg == "unmute") {
    console.log(sid + " unmuted themself");
    document.querySelector(`#mute${sid}`).style.visibility = "hidden";
    micInfo[sid] = "on";
  } else if (msg == "videooff") {
    console.log(sid + "turned video off");
    document.querySelector(`#vidoff${sid}`).style.visibility = "visible";
    videoInfo[sid] = "off";
  } else if (msg == "videoon") {
    console.log(sid + "turned video on");
    document.querySelector(`#vidoff${sid}`).style.visibility = "hidden";
    videoInfo[sid] = "on";
  }
});

whiteboardButt.addEventListener("click", () => {
  document.querySelector(".whiteboard-cont").classList.toggle("hidden");
});

cutCall.addEventListener("click", () => {
  location.href = "https://daarolquran.com/";
});

startCall();
