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

		this.userName = startingPosition.name;
		this.avatar = startingPosition.model;

		let name = document.createElement('div');
		name.textContent = startingPosition.name;
		name.className = 'player-name';

		this.nameTag = new CSS2DObject(name);
		this.nameTag.position.set(0, 4, 0);

		/**@type{Object.<string,THREE.AnimationAction>} */
		this.availableAnimations = {
			WALKING: null,
			IDLE: null,
		};

		// Create character model with starting position
		// If u want to include new animations download them from mixamo with options:
		// If available tick "In Place"
		// Format Fbx 7.4
		// Skin: Without Skin
		this.loader.load(
			`img/models/avatars/${startingPosition.model}.fbx`,
			model => {
				this.anims = new THREE.AnimationMixer(model);
				this.loader.load('img/models/animations/Idle.fbx', data => {
					this.availableAnimations.IDLE = this.anims.clipAction(data.animations[0]);
					this.availableAnimations.IDLE.setEffectiveWeight(1);
					this.availableAnimations.IDLE.play();
				});
				this.loader.load('img/models/animations/Walking.fbx', data => {
					this.availableAnimations.WALKING = this.anims.clipAction(
						data.animations[0]
					);
					this.availableAnimations.WALKING.setEffectiveWeight(0);
					this.availableAnimations.WALKING.play();
				});
				model.traverse(o => {
					if (o.isMesh) {
						o.castShadow = true;
						o.receiveShadow = true;

						// Hide hat
						if (o.name === 'Hat') {
							o.visible = false;
						}
					}
				});

				// Load texture
				this.textureLoader.load(
					`img/models/avatars/textures/${startingPosition.model}.png`,
					function (texture) {
						model.traverse(o => {
							if (o.isMesh) {
								o.material.map = texture;
								o.material.needsUpdate = true;
							}
						});
					}
				);

				model.scale.set(0.02, 0.02, 0.02);
				// mixamo model is rotated inverse to the camera view
				model.rotateY(Math.PI);
				this.model = new THREE.Group();
				this.model.add(model);
				this.model.add(this.nameTag);
				this.game.scene.add(this.model);
				this.model.layers.enable(3);
				this.model.position.set(this.position.x, 0.2, this.position.z);
				this.model.rotation.order = 'YXZ';
				this.model.rotation.y = startingPosition.ry;
			}
		);

		console.log('New Remote Player created');
	}

	updatePosition(position) {
		this.position.x = position.x;
		this.position.y = position.y;
		this.position.z = position.z;

		this.rotation.y = position.ry;

		this.velocity = position.velocity;
		if (position.name) {
			this.userName = position.name;
			this.nameTag.element.innerText = this.userName;
		}
		if (position.model) {
			this.avatar = position.model;
			delete position.model;
			this.game.scene.remove(this.model);
			this.loader.load(`img/models/avatars/${this.avatar}.fbx`, model => {
				this.anims = new THREE.AnimationMixer(model);
				let avan = this.availableAnimations;
				this.availableAnimations = {};
				console.debug(avan);
				Object.entries(avan).forEach(([k, v]) => {
					this.availableAnimations[k] = this.anims.clipAction(v.getClip());
					this.availableAnimations[k].play();
				});
				model.traverse(o => {
					if (o.isMesh) {
						o.castShadow = true;
						o.receiveShadow = true;

						// Hide hat
						if (o.name === 'Hat') {
							o.visible = false;
						}
					}
				});

				// Load texture
				this.textureLoader.load(
					`img/models/avatars/textures/${this.avatar}.png`,
					function (texture) {
						model.traverse(o => {
							if (o.isMesh) {
								o.material.map = texture;
								o.material.needsUpdate = true;
							}
						});
					}
				);

				model.scale.set(0.02, 0.02, 0.02);
				// mixamo model is rotated inverse to the camera view
				//model.rotateY(Math.PI);
				this.model = new THREE.Group();
				this.model.add(model);
				this.model.add(this.nameTag);
				this.game.scene.add(this.model);
				this.model.position.set(this.position.x, 0.2, this.position.z);
				this.model.rotation.order = 'YXZ';
			});
			// TODO: Change Model
		}

		if (this.model) {
			this.model.position.set(position.x, 0.2, position.z);
			this.model.rotation.y = position.ry;
			this.model.rotateY(Math.PI);

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
			this.model.position.needsUpdate = true; // tell three.js to update the position
		}
	}

	deletePlayer() {
		if (this.model) {
			this.game.scene.remove(this.model);
			this.nameTag.element.remove();
			this.model = undefined;
		}
	}
}
