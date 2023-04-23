class GalerieApp {
  constructor() {
    console.log("test");
    let player = new Player();
  }
}

class Player {
  constructor() {
    var socket = io();
  }
}

let _APP = null;

window.addEventListener("DOMContentLoaded", () => {
  _APP = new GalerieApp();
});
