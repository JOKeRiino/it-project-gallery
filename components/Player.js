import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export class Player {
	id = '';
	/**@type {THREE.Vector3} */
	position;
	/**@type {THREE.Vector3} */
	rotation;
	/**@type {GalerieApp} */
	game;
	/**@type {FBXLoader} */
	loader;
	name = '';
	avatar = '';
	/**@param {GalerieApp} game */
	constructor(game) {
		this.game = game;
		this.loader = new FBXLoader(game.loadingManager)
		this.loader.setPath('img/models/avatars/')
		this.loader.setResourcePath('img/models/avatars/textures/');
		this.textureLoader = new THREE.TextureLoader(game.loadingManager);
	}
}
