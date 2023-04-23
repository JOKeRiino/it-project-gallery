import * as THREE from "three";
import { FirstPersonControls } from "three/examples/jsm/controls/FirstPersonControls.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";

const KEYS = {
  a: 65,
  s: 83,
  w: 87,
  d: 68,
};

function clamp(x, a, b) {
  return Math.min(Math.max(x, a), b);
}

class InputController {
  constructor(target) {
    this.target_ = target || document;
    this.initialize_();
  }

  initialize_() {
    this.current_ = {
      leftButton: false,
      rightButton: false,
      mouseXDelta: 0,
      mouseYDelta: 0,
      mouseX: 0,
      mouseY: 0,
    };
    this.previous_ = null;
    this.keys_ = {};
    this.previousKeys_ = {};
    this.target_.addEventListener(
      "mousedown",
      (e) => this.onMouseDown_(e),
      false
    );
    this.target_.addEventListener(
      "mousemove",
      (e) => this.onMouseMove_(e),
      false
    );
    this.target_.addEventListener("mouseup", (e) => this.onMouseUp_(e), false);
    this.target_.addEventListener("keydown", (e) => this.onKeyDown_(e), false);
    this.target_.addEventListener("keyup", (e) => this.onKeyUp_(e), false);
  }

  onMouseMove_(e) {
    this.current_.mouseX = e.pageX - window.innerWidth / 2;
    this.current_.mouseY = e.pageY - window.innerHeight / 2;

    if (this.previous_ === null) {
      this.previous_ = { ...this.current_ };
    }

    this.current_.mouseXDelta = this.current_.mouseX - this.previous_.mouseX;
    this.current_.mouseYDelta = this.current_.mouseY - this.previous_.mouseY;
  }

  onMouseDown_(e) {
    this.onMouseMove_(e);

    switch (e.button) {
      case 0: {
        this.current_.leftButton = true;
        break;
      }
      case 2: {
        this.current_.rightButton = true;
        break;
      }
    }
  }

  onMouseUp_(e) {
    this.onMouseMove_(e);

    switch (e.button) {
      case 0: {
        this.current_.leftButton = false;
        break;
      }
      case 2: {
        this.current_.rightButton = false;
        break;
      }
    }
  }

  onKeyDown_(e) {
    this.keys_[e.keyCode] = true;
  }

  onKeyUp_(e) {
    this.keys_[e.keyCode] = false;
  }

  key(keyCode) {
    return !!this.keys_[keyCode];
  }

  isReady() {
    return this.previous_ !== null;
  }

  update() {
    if (this.previous_ !== null) {
      this.current_.mouseXDelta = this.current_.mouseX - this.previous_.mouseX;
      this.current_.mouseYDelta = this.current_.mouseY - this.previous_.mouseY;

      this.previous_ = { ...this.current_ };
    }
  }
}

class FirstPersonCamera {
  constructor(camera, objects) {
    this.camera_ = camera;
    this.input_ = new InputController();
    this.rotation_ = new THREE.Quaternion();
    this.translation_ = new THREE.Vector3(0, 2, 0);
    this.phi_ = 0;
    this.phiSpeed_ = 8;
    this.theta_ = 0;
    this.thetaSpeed_ = 5;
    this.headBobActive_ = false;
    this.headBobTimer_ = 0;
    this.objects_ = objects;
  }

  update(timeElapsedS) {
    this.updateRotation_(timeElapsedS);
    this.updateCamera_(timeElapsedS);
    this.updateTranslation_(timeElapsedS);
    this.input_.update(timeElapsedS);
  }

  updateCamera_(_) {
    this.camera_.quaternion.copy(this.rotation_);
    this.camera_.position.copy(this.translation_);
    this.camera_.position.y += Math.sin(this.headBobTimer_ * 10) * 1.5;

    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.rotation_);

    const dir = forward.clone();

    forward.multiplyScalar(100);
    forward.add(this.translation_);

    let closest = forward;
    const result = new THREE.Vector3();
    const ray = new THREE.Ray(this.translation_, dir);
    for (let i = 0; i < this.objects_.length; ++i) {
      if (ray.intersectBox(this.objects_[i], result)) {
        if (result.distanceTo(ray.origin) < closest.distanceTo(ray.origin)) {
          closest = result.clone();
        }
      }
    }

    this.camera_.lookAt(closest);
  }

  updateTranslation_(timeElapsedS) {
    const forwardVelocity =
      (this.input_.key(KEYS.w) ? 1 : 0) + (this.input_.key(KEYS.s) ? -1 : 0);
    const strafeVelocity =
      (this.input_.key(KEYS.a) ? 1 : 0) + (this.input_.key(KEYS.d) ? -1 : 0);

    const qx = new THREE.Quaternion();
    qx.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.phi_);

    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(qx);
    forward.multiplyScalar(forwardVelocity * timeElapsedS * 10);

    const left = new THREE.Vector3(-1, 0, 0);
    left.applyQuaternion(qx);
    left.multiplyScalar(strafeVelocity * timeElapsedS * 10);

    this.translation_.add(forward);
    this.translation_.add(left);

    if (forwardVelocity != 0 || strafeVelocity != 0) {
      this.headBobActive_ = true;
    }
  }

  updateRotation_(timeElapsedS) {
    const xh = this.input_.current_.mouseXDelta / window.innerWidth;
    const yh = this.input_.current_.mouseYDelta / window.innerHeight;

    this.phi_ += -xh * this.phiSpeed_;
    this.theta_ = clamp(
      this.theta_ + -yh * this.thetaSpeed_,
      -Math.PI / 3,
      Math.PI / 3
    );

    const qx = new THREE.Quaternion();
    qx.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.phi_);
    const qz = new THREE.Quaternion();
    qz.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.theta_);

    const q = new THREE.Quaternion();
    q.multiply(qx);
    q.multiply(qz);

    this.rotation_.copy(q);
  }
}

class Player {
  constructor() {
    var socket = io();
  }
}

class GalerieApp {
  constructor() {
    let player = new Player();
    this.initializeRenderer_();
    this.initializeLights_();
    this.initializeScene_();
    this.loadModel_();
    this.initializeFPSCamera_();

    this.previousRAF_ = null;
    this.renderAnimationFrame_();
    this._DEVSTATS_(); //Disable in FINAL BUILD
  }

  //Create and maintain Renderer, Camera, and Scene
  initializeRenderer_() {
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      80,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    this.camera.position.set(2, 3, 0);
    this.camera.lookAt(0, 0, -10);

    //EventListener to react to a change in window size.
    window.addEventListener("resize", () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      this.renderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    });
  }

  initializeFPSCamera_() {
    this.fpsCamera = new FirstPersonCamera(this.camera, this.objects);
  }

  //Add Lights to App
  initializeLights_() {
    // let pLight1 = new THREE.PointLight(0xffffff, 0.5);
    // pLight1.position.set(15, 1, 15);
    // pLight1.lookAt(20, 1, 20);
    // this.scene.add(pLight1);

    // // let dirLight = new THREE.DirectionalLight(0xffffff, 100);
    // // dirLight.position.set(10, 10, 10);

    // let light = new THREE.AmbientLight(0xffffff, 1);
    // light.position.set(0, 4, 0);
    // this.scene.add(light);
    var hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    hemiLight.position.set(0, 300, 0);
    this.scene.add(hemiLight);

    var dirLight = new THREE.DirectionalLight(0xffffff);
    dirLight.position.set(75, 300, -75);
    this.scene.add(dirLight);
  }

  //Creating the Scene
  initializeScene_() {
    //SKY
    this.scene.background = new THREE.CubeTextureLoader()
      .setPath("img/skybox/")
      .load([
        "sky_right.webp",
        "sky_left.webp",
        "sky_up.webp",
        "sky_down.webp",
        "sky_front.webp",
        "sky_back.webp",
      ]);

    //BOX
    let boxGeo = new THREE.BoxGeometry(2, 4, 2);
    let boxMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
    });

    let boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.castShadow = true;
    boxMesh.position.set(0, boxMesh.geometry.parameters.height / 2, -10);
    this.scene.add(boxMesh);

    //FLOOR
    let floorGeo = new THREE.PlaneGeometry(1000, 1000);
    floorGeo.rotateY(Math.PI);
    let floorTexture = new THREE.TextureLoader().load(
      "img/materials/grass_0.png"
    );
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(512, 512);
    let floorMat = new THREE.MeshBasicMaterial({
      map: floorTexture,
      side: THREE.FrontSide,
    });
    let floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.receiveShadow = true;
    // rotation immer in Radianten angeben -> 90° === Math.PI/2
    floorMesh.rotation.x = Math.PI / 2;
    this.scene.add(floorMesh);

    //Other
    this.objects = [];
  }

  loadModel_() {
    const log_error = function (error) {
      console.error(error);
    };
    //Car
    let mtlLoader = new MTLLoader();
    mtlLoader.setMaterialOptions({
      side: THREE.FrontSide,
      ignoreZeroRGBs: true,
    });
    mtlLoader.setPath("./img/models/");
    mtlLoader.load(
      "jeep.mtl",
      (mat) => {
        mat.preload();
        mat.materials.car_jeep_ren.color.setHex(0xffffff);
        let objLoader = new OBJLoader();
        objLoader.setMaterials(mat);
        objLoader.setPath("./img/models/").load(
          "jeep.obj",
          (obj) => {
            obj.traverse((o) => {
              o.castShadow = true;
              //o.receiveShadow = false;
            });
            obj.position.set(20, 0, 20);
            obj.scale.set(1.6, 1.6, 1.6);
            obj.baseColor = 0xffffff;
            this.scene.add(obj);
          },
          undefined,
          log_error
        );
      },
      undefined,
      log_error
    );

    //House
    mtlLoader.load(
      "house.mtl",
      (mat) => {
        mat.preload();
        let objLoader = new OBJLoader();
        objLoader = objLoader.setMaterials(mat);
        objLoader.setPath("./img/models/").load(
          "house.obj",
          (obj) => {
            obj.traverse((o) => {
              o.castShadow = true;
              //o.receiveShadow = false;
            });
            obj.position.set(-30, 1, -20);
            obj.scale.set(1.6, 1.6, 1.6);
            obj.baseColor = 0xffffff;
            this.scene.add(obj);
          },
          undefined,
          log_error
        );
      },
      undefined,
      log_error
    );
  }

  //Recursive UPDATE Loop
  renderAnimationFrame_() {
    requestAnimationFrame((f) => {
      if (this.previousRAF_ === null) {
        this.previousRAF_ = f;
      }

      this.step(f - this.previousRAF_);
      this.renderer.render(this.scene, this.camera);
      this.previousRAF_ = f;
      this.renderAnimationFrame_();
    });
  }

  step(timeElapsed) {
    const timeElapsedS = timeElapsed * 0.001;
    this.fpsCamera.update(timeElapsedS);
  }

  //FPS and RAM stats
  _DEVSTATS_() {
    var script = document.createElement("script");
    script.onload = function () {
      var stats = new Stats();
      document.body.appendChild(stats.dom);
      requestAnimationFrame(function loop() {
        stats.update();
        requestAnimationFrame(loop);
      });
    };
    script.src = "https://mrdoob.github.io/stats.js/build/stats.min.js";
    document.head.appendChild(script);
  }
}

let _APP = null;

window.addEventListener("DOMContentLoaded", () => {
  _APP = new GalerieApp();
});
