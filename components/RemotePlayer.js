import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Player } from './Player.js';

export class RemotePlayer extends Player {
	constructor(game, startingPosition) {
		super(game);

		this.position = new THREE.Vector3();
		this.rotation = new THREE.Vector3();

		this.position.x = startingPosition.x;
		this.position.y = startingPosition.y;
		this.position.z = startingPosition.z;

		this.rotation.y = startingPosition.ry;
		this.rotation.x = startingPosition.rx;
		this.rotation.z = startingPosition.rz;

		this.name = startingPosition.name;
		this.avatar = startingPosition.model;

		let name = document.createElement('div');
		name.textContent = startingPosition.name;
		name.className = 'player-name';

		this.nameTag = new CSS2DObject(name);
		this.nameTag.position.set(0, 3, 0);

		/**@type{Object.<string,THREE.AnimationAction>} */
		this.availableAnimations = {
			WALKING: null,
			IDLE: null,
		};

		//Create character model with starting position
		// If u want to include new animations download them from mixamo with options:
		// If available tick "In Place"
		// Format Fbx 7.4
		// Skin: Without Skin
		this.loader.load(`${startingPosition.model}.fbx`, model => {
			this.anims = new THREE.AnimationMixer(model);

			this.loader.load(`${startingPosition.model}@idle.fbx`, object => {
				this.availableAnimations.IDLE = this.anims.clipAction(object.animations[0]);
			});

			this.availableAnimations.IDLE.setEffectiveWeight(1);
			this.availableAnimations.IDLE.play();

			this.loader.load(`${startingPosition.model}@walking.fbx`, object => {
				this.availableAnimations.WALKING = this.anims.clipAction(
					object.animations[0]
				);
			});

			this.availableAnimations.WALKING.setEffectiveWeight(0);
			this.availableAnimations.WALKING.play();

			let bbox = new THREE.Box3();
			bbox.setFromObject(model);
			const targetHeight = 3.15;
			let modelHeight = bbox.max.y - bbox.min.y;

			let scaleFactor = targetHeight / modelHeight;

			model.scale.set(scaleFactor, scaleFactor, scaleFactor);
			this.model = new THREE.Group();
			this.model.add(model);
			this.model.add(this.nameTag);
			//this.model = model;
			this.game.scene.add(this.model);
			this.model.layers.enable(3);
			this.model.position.set(this.position.x, 0.2, this.position.z); //this.position.y
			this.model.rotation.order = 'YXZ';
			//this.model.rotation.x = startingPosition.rx;
			this.model.rotation.y = startingPosition.ry;
			//this.model.rotation.z = startingPosition.rz;
		});

		console.log('New Remote Player created');
	}

	updatePosition(position) {
		this.position.x = position.x;
		this.position.y = position.y;
		this.position.z = position.z;

		this.rotation.y = position.ry;
		// this.rotation.x = position.rx;
		// this.rotation.z = position.rz;

		this.velocity = position.velocity;
		if (position.name) {
			this.name = position.name;
			this.nameTag.element.innerText = this.name;
		}
		if (position.model) {
			this.avatar = position.model;
			delete position.model;
			this.game.scene.remove(this.model);
			this.loader.load(`${this.avatar}.fbx`, model => {
				this.anims = new THREE.AnimationMixer(model);
				this.availableAnimations = {};
				this.fbxLoader.load(`${this.avatar}@idle.fbx`, object => {
					this.availableAnimations.IDLE = this.anims.clipAction(
						object.animations[0]
					);
				});
				//this.availableAnimations.IDLE.setEffectiveWeight(1);
				this.availableAnimations.IDLE.play();

				this.fbxLoader.load(`${this.avatar}@walking.fbx`, object => {
					this.availableAnimations.WALKING = this.anims.clipAction(
						object.animations[0]
					);
				});
				//this.availableAnimations.WALKING.setEffectiveWeight(0);
				this.availableAnimations.WALKING.play();

				let bbox = new THREE.Box3();
				bbox.setFromObject(model);
				const targetHeight = 3.15;
				let modelHeight = bbox.max.y - bbox.min.y;

				let scaleFactor = targetHeight / modelHeight;

				model.scale.set(scaleFactor, scaleFactor, scaleFactor);
				this.model = new THREE.Group();
				this.model.add(model);
				this.model.add(this.nameTag);
				//this.model = model;
				this.game.scene.add(this.model);
				this.model.position.set(this.position.x, 0.2, this.position.z); //this.position.y
				this.model.rotation.order = 'YXZ';
				//this.model.rotation.x = position.rx;
				//this.model.rotation.y = position.ry;
				//this.model.rotation.z = position.rz;
			});
			// TODO: Change Model
		}

		if (this.model) {
			// update the position of the block
			this.model.position.set(position.x, 0.2, position.z); // position.y
			// update the rotation of the block
			//this.model.rotation.x = position.rx;
			this.model.rotation.y = position.ry;
			//this.model.rotation.z = position.rz;

			if (this.velocity > 0.5) {
				this.availableAnimations.WALKING?.setEffectiveWeight(2);
				this.availableAnimations.IDLE?.setEffectiveWeight(0);
			} else if (this.velocity < 0.001) {
				this.availableAnimations.WALKING?.setEffectiveWeight(0);
				this.availableAnimations.IDLE?.setEffectiveWeight(1);
			} else {
				this.availableAnimations.WALKING?.setEffectiveWeight(this.velocity * 2);
				this.availableAnimations.IDLE?.setEffectiveWeight(1 / this.velocity);
			}
			// console.log(this.velocity);

			this.model.position.needsUpdate = true; // tell three.js to update the position
		}
	}

	deletePlayer() {
		if (this.model) {
			this.game.scene.remove(this.model);
			this.nameTag.element.remove();
			// this.block.texture.dispose(); // dispose its texture
			this.model = undefined; // set it to undefined
		}
	}
}
