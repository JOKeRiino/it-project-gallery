const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);

app.use(express.static(__dirname));
app.get("/", function (req, res) {
  res.sendFile(__dirname + "/index.html");
});

io.on("connection", function (socket) {
  socket.userData = { x: 0, y: 0, z: 0, heading: 0 }; //Default values;

  console.log(`${socket.id} connected`);
  socket.on("disconnect", function () {
    console.log(`Player ${socket.id} disconnected`);
  });

  socket.on("init", function (data) {
    console.log(data);
  });
});

http.listen(3000, function () {
  console.log("Listening on port 3000");
});

setInterval(function () {
  let players = [];

  for (const [_, socket] of io.of("/").sockets) {
    // console.log(socket);
    players.push({
      id: socket.id,
      x: socket.userData.x,
      y: socket.userData.y,
      z: socket.userData.z,
      heading: socket.userData.heading,
    });
  }

  if (players.length > 0) io.emit("players", players);
}, 4000);
