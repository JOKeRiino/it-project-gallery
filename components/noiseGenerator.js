/**
 * Noise Generator that can create Perlin Noise Maps for
 * Map generation
 *
 */
export class NoiseGenerator {
	constructor(nodes, seed) {
		this.islandGrid = [];
		this.nodes = nodes;
		this.seed = seed;
	}

	fade(t) {
		return t * t * t * (t * (t * 6 - 15) + 10);
	}

	lerp(t, a, b) {
		return a + t * (b - a);
	}

	grad(hash, x, y, z) {
		var h = hash & 15; // CONVERT LO 4 BITS OF HASH CODE
		var u = h < 8 ? x : y, // INTO 12 GRADIENT DIRECTIONS.
			v = h < 4 ? y : h == 12 || h == 14 ? x : z;
		return ((h & 1) == 0 ? u : -u) + ((h & 2) == 0 ? v : -v);
	}

	scale(n) {
		return (1 + n) / 2;
	}

	// This is a port of Ken Perlin's Java code. The
	// original Java code is at http://cs.nyu.edu/%7Eperlin/noise/.
	// Note that in this version, a number from 0 to 1 is returned.
	getNoise(x, y, z) {
		var p = new Array(512);
		var permutation = [
			151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140,
			36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234,
			75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237,
			149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48,
			27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105,
			92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73,
			209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86,
			164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38,
			147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189,
			28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153,
			101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224,
			232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144,
			12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214,
			31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150,
			254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66,
			215, 61, 156, 180,
		];
		for (var i = 0; i < 256; i++) p[256 + i] = p[i] = permutation[i];

		var X = Math.floor(x) & 255, // FIND UNIT CUBE THAT
			Y = Math.floor(y) & 255, // CONTAINS POINT.
			Z = Math.floor(z) & 255;
		x -= Math.floor(x); // FIND RELATIVE X,Y,Z
		y -= Math.floor(y); // OF POINT IN CUBE.
		z -= Math.floor(z);
		var u = this.fade(x), // COMPUTE FADE CURVES
			v = this.fade(y), // FOR EACH OF X,Y,Z.
			w = this.fade(z);
		var A = p[X] + Y,
			AA = p[A] + Z,
			AB = p[A + 1] + Z, // HASH COORDINATES OF
			B = p[X + 1] + Y,
			BA = p[B] + Z,
			BB = p[B + 1] + Z; // THE 8 CUBE CORNERS,

		return this.scale(
			this.lerp(
				w,
				this.lerp(
					v,
					this.lerp(
						u,
						this.grad(p[AA], x, y, z), // AND ADD
						this.grad(p[BA], x - 1, y, z)
					), // BLENDED
					this.lerp(
						u,
						this.grad(p[AB], x, y - 1, z), // RESULTS
						this.grad(p[BB], x - 1, y - 1, z)
					)
				), // FROM  8
				this.lerp(
					v,
					this.lerp(
						u,
						this.grad(p[AA + 1], x, y, z - 1), // CORNERS
						this.grad(p[BA + 1], x - 1, y, z - 1)
					), // OF CUBE
					this.lerp(
						u,
						this.grad(p[AB + 1], x, y - 1, z - 1),
						this.grad(p[BB + 1], x - 1, y - 1, z - 1)
					)
				)
			)
		);
	}

	addBorder(array) {
		const rows = array.length;
		const cols = array[0].length;
		const newArray = new Array(rows + 2)
			.fill(0)
			.map(() => new Array(cols + 2).fill(' ')); // create a new array with an additional border of zeros

		for (let i = 1; i <= rows; i++) {
			for (let j = 1; j <= cols; j++) {
				newArray[i][j] = array[i - 1][j - 1]; // copy the original array into the new array, leaving the border of zeros
			}
		}

		return newArray;
	}

	removeBorder(array) {
		const rows = array.length;
		const cols = array[0].length;
		const newArray = new Array(rows - 2)
			.fill(' ')
			.map(() => new Array(cols - 2).fill(' ')); // create a new array with a smaller size

		for (let i = 1; i < rows - 1; i++) {
			for (let j = 1; j < cols - 1; j++) {
				newArray[i - 1][j - 1] = array[i][j]; // copy the inner elements of the original array into the new array
			}
		}

		return newArray;
	}

	getScore(y, x, array) {
		let types = [
			'◽️', // undefined island piece
			'f', // floor piece (no walls) --> score 4
			'w', // wall piece (1 wall) --> score 3
			'e', // edge piece (2 walls) --> score 2
			'u', // u piece (3 walls) --> score 1
		];
		let score = 0;
		if (types.includes(array[y][x - 1])) {
			score += 1;
		}
		if (types.includes(array[y][x + 1])) {
			score += 1;
		}
		if (types.includes(array[y + 1][x])) {
			score += 1;
		}
		if (types.includes(array[y - 1][x])) {
			score += 1;
		}
		return score;
	}

	getWallType(y, x, array) {
		if (array[y][x - 1] === ' ') {
			return 'lw'; //Left Wall
		} else if (array[y][x + 1] === ' ') {
			return 'rw'; //Right Wall
		} else if (array[y + 1][x] === ' ') {
			return 'bw'; //Bottom Wall
		} else {
			return 'tw'; //Top Wall
		}
	}

	getUWallType(y, x, array) {
		if (array[y][x - 1] !== ' ') {
			return 'lu'; //Left Opening U
		} else if (array[y][x + 1] !== ' ') {
			return 'ru'; //Right Opening U
		} else if (array[y + 1][x] !== ' ') {
			return 'bu'; //Bottom Opening U
		} else {
			return 'tu'; //Top Opening U
		}
	}

	getEdgeWallType(y, x, array) {
		if (array[y][x - 1] === ' ') {
			if (array[y - 1][x] === ' ') {
				return 'tl'; //Bottom Left Corner
			} else {
				return 'bl'; //Top Left Corner
			}
		} else if (array[y][x + 1] === ' ') {
			if (array[y - 1][x] === ' ') {
				return 'tr'; //Bottom Right Corner
			} else {
				return 'br'; //Top Left Corner
			}
		}
	}

	getPillarByChance(y, x, array) {
		let score = 0;
		if (array[y][x - 1] === 'f' || array[y][x - 1] === 'P') {
			score += 1;
		}
		if (array[y][x + 1] === 'f') {
			score += 1;
		}
		if (array[y + 1][x] === 'f') {
			score += 1;
		}
		if (array[y - 1][x] === 'f') {
			score += 1;
		}
		if (array[y - 1][x - 1] === 'f') {
			score += 1;
		}
		if (array[y + 1][x - 1] === 'f') {
			score += 1;
		}
		if (array[y - 1][x + 1] === 'f') {
			score += 1;
		}
		if (array[y + 1][x + 1] === 'f') {
			score += 1;
		}

		if (score === 8) {
			return 'P';
		}
		return 'f';
	}

	generateNoise_() {
		//Generate an Island with Perlin Noise
		for (let y = 0; y < this.nodes; y++) {
			let row = [];
			for (let x = 0; x < this.nodes; x++) {
				const distance = Math.sqrt(
					(y - this.nodes / 2) ** 2 + (x - this.nodes / 2) ** 2
				); // calculate the distance to the center of the matrix
				const value = this.getNoise(
					(y / this.nodes) * this.seed,
					(x / this.nodes) * this.seed,
					0.8
				); // generate a Perlin noise value between 0 and 1
				const scale = 1 - distance / (this.nodes / 2); // calculate a scaling factor based on the distance
				const scaledValue = value * scale; // apply the scaling factor to the noise value
				row.push(scaledValue > 0.1 ? '◽️' : ' ');
			}
			this.islandGrid.push(row);
		}

		//DEBUG:
		//console.log(this.islandGrid);

		let borderedGrid = this.addBorder(this.islandGrid);

		//Check what sides need to be walls of what kind
		for (let y = 0; y < this.nodes + 2; y++) {
			for (let x = 0; x < this.nodes + 2; x++) {
				if (borderedGrid[y][x] === '◽️') {
					switch (this.getScore(y, x, borderedGrid)) {
						case 4:
							borderedGrid[y][x] = 'f';
							break;
						case 3:
							borderedGrid[y][x] = 'w';
							break;
						case 2:
							borderedGrid[y][x] = 'e';
							break;
						case 1:
							borderedGrid[y][x] = 'u';
							break;
						default:
							borderedGrid[y][x] = '◽️';
					}
				}
			}
		}

		//Distinguish the different wall types
		for (let y = 0; y < this.nodes + 2; y++) {
			for (let x = 0; x < this.nodes + 2; x++) {
				switch (borderedGrid[y][x]) {
					case 'w':
						borderedGrid[y][x] = this.getWallType(y, x, borderedGrid);
						break;
					case 'u':
						borderedGrid[y][x] = this.getUWallType(y, x, borderedGrid);
						break;
					case 'e':
						borderedGrid[y][x] = this.getEdgeWallType(y, x, borderedGrid);
						break;
					case 'f':
						borderedGrid[y][x] = this.getPillarByChance(y, x, borderedGrid);
						break;
					default:
						borderedGrid[y][x] = borderedGrid[y][x];
				}
			}
		}

		this.islandGrid = this.removeBorder(borderedGrid);
		return this.islandGrid;
	}
}
