import * as THREE from 'three';
import { FirstPersonControls } from 'three/examples/jsm/controls/FirstPersonControls.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { NoiseGenerator } from './components/noiseGenerator.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const KEYS = {
	a: 65,
	s: 83,
	w: 87,
	d: 68,
};

function clamp(x, a, b) {
	return Math.min(Math.max(x, a), b);
}

function getImgDimensions(img, canvasSize) {
	let w, h;
	if (img.width > img.height) {
		w = canvasSize;
		h = canvasSize * (img.height / img.width);
	} else {
		h = canvasSize;
		w = canvasSize * (img.width / img.height);
	}

	return [w, h];
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
			'mousedown',
			e => this.onMouseDown_(e),
			false
		);
		this.target_.addEventListener(
			'mousemove',
			e => this.onMouseMove_(e),
			false
		);
		this.target_.addEventListener('mouseup', e => this.onMouseUp_(e), false);
		this.target_.addEventListener('keydown', e => this.onKeyDown_(e), false);
		this.target_.addEventListener('keyup', e => this.onKeyUp_(e), false);
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

// TODO Klassen LocalPlayer und RemotePlayer erstellen?
class Player {
	constructor(game) {
		this.game = game;
	}
}

class LocalPlayer extends Player {
	constructor(game) {
		super(game);

		const socket = io.connect('http://localhost:3000');
		let localPlayer = this;

		socket.on('connect', function () {
			console.log(socket.id);
			localPlayer.id = socket.id;
		});

		socket.on('players', function (data) {
			game.serverPlayers = data;
		});
	}
}

class RemotePlayer extends Player {
	// Create Models for remote players
}

class GalerieApp {
	constructor() {
		// Initialize local player
		this.player = new LocalPlayer(this);

		// Two seperate variables to check wether the server sends new players or if players are missing
		this.serverPlayers = [];
		this.localPlayers = {};
		this.roomTiles = [];

		this.initializeRenderer_();
		this.initializeLights_();
		this.initializeScene_();
		this.initializeFPSCamera_();

		//Create a World and Render it
		this.initializeGallery_();

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

		//Configuring Loading Manager for Loading Screen
		this.loadingManager = new THREE.LoadingManager();
		let loader = document.getElementById('loader');
		let loadingScreen = document.getElementById('loading-screen');
		this.loadingManager.onProgress = (url, loaded, total) => {
			loader.style.width = (loaded / total) * 100 + '%';
		};
		this.loadingManager.onLoad = () => {
			loadingScreen.style.display = 'none';
		};
		this.gltfLoader = new GLTFLoader(this.loadingManager);

		this.camera.position.set(2, 3, 0);
		this.camera.lookAt(0, 0, -10);

		//EventListener to react to a change in window size.
		window.addEventListener('resize', () => {
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
			.setPath('img/skybox/')
			.load([
				'sky_right.webp',
				'sky_left.webp',
				'sky_up.webp',
				'sky_down.webp',
				'sky_front.webp',
				'sky_back.webp',
			]);

		//FLOOR
		let floorGeo = new THREE.PlaneGeometry(1000, 1000);
		floorGeo.rotateY(Math.PI);
		let floorTexture = new THREE.TextureLoader().load(
			'img/materials/grass_0.png'
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

	async initializeGallery_() {
		//Funktion generiert so lange Räume bis die Größe passt.
		//Erst dann wird der Raum gerendert.
		//So sollten wir das auf den Server packen und als JSON verschicken können.
		this.score = 13;
		this.imgCount = 0;
		this.noiseGeneratorSize = 1;

		//Make the API Call to unsplash for this.score amount of images.
		const apiKey = 'sWgSDWNA9FkyrQ0TMq6jgVOFO-mBQcADR5DUCMVJNJw'; // Replace with your own API key
		const apiUrl = `https://api.unsplash.com/photos/random?client_id=${apiKey}&count=${this.score}`;

		try {
			const response = await fetch(apiUrl);
			const imageData = await response.json();
			const images = [];

			imageData.forEach((data, index) => {
				images[index] = {
					url: data.urls.regular,
					alt: data.alt_description,
					width: data.width,
					height: data.height,
					author: data.user.name,
					profileUrl: data.user.links.html,
				};
			});

			//If API Call is successful, iteratively generate a room until the min. size is reached.
			while (this.imgCount < this.score) {
				this.roomTiles = [];
				this.noiseGeneratorSize += 2;
				let grid = new NoiseGenerator(
					this.noiseGeneratorSize,
					1 //Seed for Generation
				).generateNoise_();
				this.imgCount = this.generateRoom_(grid, images);
				console.log(this.imgCount, this.roomTiles);
			}
		} catch (e) {
			console.error(e);
		}

		this.roomTiles.forEach(r => {
			this.scene.add(r);
		});
	}

	generateRoom_(matrix, images) {
		let imageSpacer = 0;
		let imageCount = 0;

		const boxWidth = 5;
		const boxHeight = 0.2;
		const wallHeight = 10;
		const wallDepth = 0.2;
		const boxDepth = 5;
		const wallTypes = ['tw', 'lw', 'rw', 'bw'];
		const edgeTypes = ['tr', 'tl', 'br', 'bl'];
		const uTypes = ['tu', 'bu', 'lu', 'ru'];

		const texLoader = new THREE.TextureLoader();
		texLoader.crossOrigin = 'Anonymous';

		//Floor Texture + Mat
		const floorTexture = new THREE.TextureLoader().load(
			'/img/materials/carpet2.jpg'
		);
		const floorMaterial = new THREE.MeshBasicMaterial({
			map: floorTexture,
		});
		//Wall Texture + Mat
		const wallTexture = new THREE.TextureLoader().load(
			'/img/materials/wall1.png'
		);
		const wallMaterial = new THREE.MeshBasicMaterial({
			map: wallTexture,
		});
		//Gallery Wall Texture + Mat
		const galleryWallTexture = new THREE.TextureLoader().load(
			'/img/materials/gallerywall1.png'
		);
		const galleryWallMaterial = new THREE.MeshBasicMaterial({
			map: galleryWallTexture,
		});

		for (let y = 0; y < matrix.length; y++) {
			for (let x = 0; x < matrix.length; x++) {
				if (matrix[y][x] === 'f') {
					//All tiles that are just floor
					const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
					const mesh = new THREE.Mesh(geometry, floorMaterial);
					mesh.position.set(
						x * boxWidth,
						mesh.geometry.parameters.height / 2,
						y * boxWidth
					);

					//this.scene.add(mesh);
					this.roomTiles.push(mesh);
				} else if (matrix[y][x] === 'P') {
					const oneWallGroup = new THREE.Group();
					//Pillar
					//Floor
					const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
					const mesh = new THREE.Mesh(geometry, floorMaterial);
					mesh.position.set(0, mesh.geometry.parameters.height / 2, 0);
					oneWallGroup.add(mesh);
					//The concrete Wall
					const wallGeometry = new THREE.BoxGeometry(
						boxWidth,
						wallHeight * 0.6,
						wallDepth * 5
					);
					const wallMesh = new THREE.Mesh(wallGeometry, galleryWallMaterial);
					wallMesh.position.set(
						0,
						wallMesh.geometry.parameters.height / 2,
						0 - boxWidth / 2
					);
					oneWallGroup.add(wallMesh);
					// Add one image to every side of the concrete wall!
					//Image Canvas First Side
					if (imageCount < images.length) {
						const dims = getImgDimensions(images[imageCount], 4);
						const canvasGeometry = new THREE.BoxGeometry(dims[0], dims[1], 0.1);
						let imgTexture = texLoader.load(images[imageCount].url);
						const canvasMaterial = new THREE.MeshBasicMaterial({
							map: imgTexture,
							side: THREE.FrontSide,
						});
						const canvasMesh = new THREE.Mesh(canvasGeometry, canvasMaterial);
						canvasMesh.position.set(
							0,
							wallMesh.geometry.parameters.height / 2 + 0.3,
							0 - boxWidth / 2 + (wallDepth / 2 + 0.4)
						);
						oneWallGroup.add(canvasMesh);
						imageCount++;
					} else {
						const canvasGeometry = new THREE.BoxGeometry(3, 3, 0.1);
						let imgTexture = texLoader.load(
							`/img/materials/ad${Math.random() > 0.5 ? '1' : '2'}.jpg`
						);
						const canvasMaterial = new THREE.MeshBasicMaterial({
							map: imgTexture,
							side: THREE.FrontSide,
						});
						const canvasMesh = new THREE.Mesh(canvasGeometry, canvasMaterial);
						canvasMesh.position.set(
							0,
							wallMesh.geometry.parameters.height / 2 + 0.3,
							0 - boxWidth / 2 + (wallDepth / 2 + 0.4)
						);
						oneWallGroup.add(canvasMesh);
					}

					//Image Canvas Second Side
					if (imageCount < images.length) {
						const dims = getImgDimensions(images[imageCount], 4);
						const canvasGeometry = new THREE.BoxGeometry(dims[0], dims[1], 0.1);
						let imgTexture = texLoader.load(images[imageCount].url);
						const canvasMaterial = new THREE.MeshBasicMaterial({
							map: imgTexture,
							side: THREE.FrontSide,
						});
						const canvasMesh = new THREE.Mesh(canvasGeometry, canvasMaterial);
						canvasMesh.position.set(
							0,
							wallMesh.geometry.parameters.height / 2 + 0.3,
							0 - boxWidth / 2 - (wallDepth / 2 + 0.4)
						);
						oneWallGroup.add(canvasMesh);
						imageCount++;
					} else {
						const canvasGeometry = new THREE.BoxGeometry(3, 3, 0.1);
						let imgTexture = texLoader.load(
							`/img/materials/ad${Math.random() > 0.5 ? '1' : '2'}.jpg`
						);
						const canvasMaterial = new THREE.MeshBasicMaterial({
							map: imgTexture,
							side: THREE.FrontSide,
						});
						const canvasMesh = new THREE.Mesh(canvasGeometry, canvasMaterial);
						canvasMesh.position.set(
							0,
							wallMesh.geometry.parameters.height / 2 + 0.3,
							0 - boxWidth / 2 - (wallDepth / 2 + 0.4)
						);
						oneWallGroup.add(canvasMesh);
					}

					oneWallGroup.position.set(x * boxWidth, 0, y * boxWidth);
					//this.scene.add(oneWallGroup);
					this.roomTiles.push(oneWallGroup);
				} else if (wallTypes.includes(matrix[y][x])) {
					const oneWallGroup = new THREE.Group();
					//Any 1 Wall
					//Ground
					const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
					const mesh = new THREE.Mesh(geometry, floorMaterial);
					mesh.position.set(0, mesh.geometry.parameters.height / 2, 0);
					oneWallGroup.add(mesh);
					//Wall
					const wallGeometry = new THREE.BoxGeometry(
						boxWidth,
						wallHeight,
						wallDepth
					);
					const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
					wallMesh.position.set(
						0,
						wallMesh.geometry.parameters.height / 2,
						0 - boxWidth / 2
					);
					oneWallGroup.add(wallMesh);
					//Image Canvas
					if (imageSpacer % 2 === 0) {
						if (imageCount < images.length) {
							const dims = getImgDimensions(images[imageCount], 5);
							const canvasGeometry = new THREE.BoxGeometry(
								dims[0],
								dims[1],
								0.1
							);
							let imgTexture = texLoader.load(images[imageCount].url);
							const canvasMaterial = new THREE.MeshBasicMaterial({
								map: imgTexture,
								side: THREE.FrontSide,
							});
							const canvasMesh = new THREE.Mesh(canvasGeometry, canvasMaterial);
							canvasMesh.position.set(
								0,
								wallMesh.geometry.parameters.height / 2,
								0 - boxWidth / 2 + 0.205
							);
							oneWallGroup.add(canvasMesh);
							imageCount++;
						} else {
							const canvasGeometry = new THREE.BoxGeometry(3, 3, 0.1);
							let imgTexture = texLoader.load(
								`/img/materials/ad${Math.random() > 0.5 ? '1' : '2'}.jpg`
							);
							const canvasMaterial = new THREE.MeshBasicMaterial({
								map: imgTexture,
								side: THREE.FrontSide,
							});
							const canvasMesh = new THREE.Mesh(canvasGeometry, canvasMaterial);
							canvasMesh.position.set(
								0,
								wallMesh.geometry.parameters.height / 2,
								0 - boxWidth / 2 + 0.205
							);
							oneWallGroup.add(canvasMesh);
						}
					}

					//ROTATION
					if (matrix[y][x] === 'lw') {
						const quaternion = new THREE.Quaternion().setFromAxisAngle(
							new THREE.Vector3(0, 1, 0),
							Math.PI / 2
						);
						oneWallGroup.applyQuaternion(quaternion);
					}
					if (matrix[y][x] === 'rw') {
						const quaternion = new THREE.Quaternion().setFromAxisAngle(
							new THREE.Vector3(0, 1, 0),
							-Math.PI / 2
						);
						oneWallGroup.applyQuaternion(quaternion);
					}
					if (matrix[y][x] === 'bw') {
						const quaternion = new THREE.Quaternion().setFromAxisAngle(
							new THREE.Vector3(0, 1, 0),
							-Math.PI
						);
						oneWallGroup.applyQuaternion(quaternion);
					}

					oneWallGroup.position.set(x * boxWidth, 0, y * boxWidth);
					//this.scene.add(oneWallGroup);
					this.roomTiles.push(oneWallGroup);
				} else if (edgeTypes.includes(matrix[y][x])) {
					const twoWallGroup = new THREE.Group();
					//Any 2 Wall 'Edge'
					//Ground
					const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
					const mesh = new THREE.Mesh(geometry, floorMaterial);
					mesh.position.set(0, mesh.geometry.parameters.height / 2, 0);
					twoWallGroup.add(mesh);
					//Wall1
					const wallGeometry = new THREE.BoxGeometry(
						boxWidth,
						wallHeight,
						wallDepth
					);
					const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
					wallMesh.position.set(
						0,
						wallMesh.geometry.parameters.height / 2,
						0 - boxWidth / 2
					);
					const wall2Geometry = new THREE.BoxGeometry(
						wallDepth,
						wallHeight,
						boxWidth
					);
					twoWallGroup.add(wallMesh);
					//Wall2
					const wall2Mesh = new THREE.Mesh(wall2Geometry, wallMaterial);
					wall2Mesh.position.set(
						0 - boxWidth / 2,
						wall2Mesh.geometry.parameters.height / 2,
						0
					);
					twoWallGroup.add(wall2Mesh);
					//Random Plant
					const random = Math.random();
					if (random > 0.7) {
						this.gltfLoader.load(
							'img/models/plant.glb',
							function (gltf) {
								gltf.scene.scale.set(3, 3, 3);
								gltf.scene.applyQuaternion(
									new THREE.Quaternion().setFromAxisAngle(
										new THREE.Vector3(0, 1, 0),
										Math.PI * Math.random()
									)
								);
								twoWallGroup.add(gltf.scene);
							},
							function (error) {}
						);
					} else if (random > 0.4) {
						this.gltfLoader.load(
							'img/models/chair.gltf',
							function (gltf) {
								gltf.scene.scale.set(3, 3, 3);
								gltf.scene.applyQuaternion(
									new THREE.Quaternion().setFromAxisAngle(
										new THREE.Vector3(0, 1, 0),
										2 * Math.PI
									)
								);
								twoWallGroup.add(gltf.scene);
							},
							function (error) {}
						);
					}

					//ROTATION
					if (matrix[y][x] === 'tr') {
						const quaternion = new THREE.Quaternion().setFromAxisAngle(
							new THREE.Vector3(0, 1, 0),
							-Math.PI / 2
						);
						twoWallGroup.applyQuaternion(quaternion);
					}
					if (matrix[y][x] === 'bl') {
						const quaternion = new THREE.Quaternion().setFromAxisAngle(
							new THREE.Vector3(0, 1, 0),
							Math.PI / 2
						);
						twoWallGroup.applyQuaternion(quaternion);
					}
					if (matrix[y][x] === 'br') {
						const quaternion = new THREE.Quaternion().setFromAxisAngle(
							new THREE.Vector3(0, 1, 0),
							-Math.PI
						);
						twoWallGroup.applyQuaternion(quaternion);
					}

					twoWallGroup.position.set(x * boxWidth, 0, y * boxWidth);
					//this.scene.add(twoWallGroup);
					this.roomTiles.push(twoWallGroup);
				} else if (uTypes.includes(matrix[y][x])) {
					const twoWallGroup = new THREE.Group();
					//Any 3 Wall 'U'
					//Floor
					const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
					const mesh = new THREE.Mesh(geometry, floorMaterial);
					mesh.position.set(0, mesh.geometry.parameters.height / 2, 0);
					twoWallGroup.add(mesh);
					//Wall 1
					const wallGeometry = new THREE.BoxGeometry(
						boxWidth,
						wallHeight,
						wallDepth
					);
					const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
					wallMesh.position.set(
						0,
						wallMesh.geometry.parameters.height / 2,
						0 - boxWidth / 2
					);
					twoWallGroup.add(wallMesh);
					//Wall 2
					const wall2Geometry = new THREE.BoxGeometry(
						wallDepth,
						wallHeight,
						boxWidth
					);
					const wall2Mesh = new THREE.Mesh(wall2Geometry, wallMaterial);
					wall2Mesh.position.set(
						0 - boxWidth / 2,
						wall2Mesh.geometry.parameters.height / 2,
						0
					);
					twoWallGroup.add(wall2Mesh);
					//Wall 3
					const wall3Geometry = new THREE.BoxGeometry(
						wallDepth,
						wallHeight,
						boxWidth
					);
					const wall3Mesh = new THREE.Mesh(wall3Geometry, wallMaterial);
					wall3Mesh.position.set(
						0 + boxWidth / 2,
						wall2Mesh.geometry.parameters.height / 2,
						0
					);
					twoWallGroup.add(wall3Mesh);
					//ROTATION
					if (matrix[y][x] === 'tu') {
						const quaternion = new THREE.Quaternion().setFromAxisAngle(
							new THREE.Vector3(0, 1, 0),
							Math.PI
						);
						twoWallGroup.applyQuaternion(quaternion);
					}

					if (matrix[y][x] === 'lu') {
						const quaternion = new THREE.Quaternion().setFromAxisAngle(
							new THREE.Vector3(0, 1, 0),
							-Math.PI / 2
						);
						twoWallGroup.applyQuaternion(quaternion);
					}

					if (matrix[y][x] === 'ru') {
						const quaternion = new THREE.Quaternion().setFromAxisAngle(
							new THREE.Vector3(0, 1, 0),
							Math.PI / 2
						);
						twoWallGroup.applyQuaternion(quaternion);
					}

					twoWallGroup.position.set(x * boxWidth, 0, y * boxWidth);
					//this.scene.add(twoWallGroup);
					this.roomTiles.push(twoWallGroup);
				}
				imageSpacer++;
			}
		}
		//set Player at the middle of the room!
		this.fpsCamera.translation_ = new THREE.Vector3(
			(matrix.length / 2) * 5,
			3,
			(matrix.length / 2) * 5
		);
		//console.log(this.roomTiles);
		console.log('Image Count: ' + imageCount);
		return imageCount;
	}

	updatePlayers() {
		const game = this;
		// console.log(this.serverPlayers);
		// console.log(game.player);
		this.serverPlayers.forEach(function (data) {
			if (game.player.id == data.id) {
				// console.log("we hit a local player");
				// do ...
			} else if (game.localPlayers.hasOwnProperty(data.id)) {
				// Check if coordinates etc. have changed
				const prevElem = game.localPlayers[data.id];
				if (
					data.x !== prevElem.x ||
					data.y !== prevElem.y ||
					data.z !== prevElem.z
				) {
					// Update dictionary
					game.localPlayers[data.id] = data;
					console.log(`Player ${data.id} updated in local players`);
				}
				// console.log(data);
			} else {
				// If it's a new player
				game.localPlayers[data.id] = data;
				console.log(`Player ${data.id} added to local players`);
			}
		});
	}

	//Recursive UPDATE Loop
	renderAnimationFrame_() {
		requestAnimationFrame(f => {
			if (this.previousRAF_ === null) {
				this.previousRAF_ = f;
			}

			this.step(f - this.previousRAF_);
			this.renderer.render(this.scene, this.camera);
			this.previousRAF_ = f;

			this.updatePlayers();
			this.renderAnimationFrame_();
		});
	}

	step(timeElapsed) {
		const timeElapsedS = timeElapsed * 0.001;
		this.fpsCamera.update(timeElapsedS);
	}

	//FPS and RAM stats
	_DEVSTATS_() {
		var script = document.createElement('script');
		script.onload = function () {
			var stats = new Stats();
			document.body.appendChild(stats.dom);
			requestAnimationFrame(function loop() {
				stats.update();
				requestAnimationFrame(loop);
			});
		};
		script.src = 'https://mrdoob.github.io/stats.js/build/stats.min.js';
		document.head.appendChild(script);
	}
}

let _APP = null;

window.addEventListener('DOMContentLoaded', () => {
	_APP = new GalerieApp();
});
