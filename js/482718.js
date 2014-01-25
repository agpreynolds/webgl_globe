var global = {
	config : {
		sphere : {
			enabled : 1,
			animate : 1,
			radius : 5,
			rotation : 0,
			latitudeBands : 30,
			longitudeBands : 30
		},
		cube : {
			enabled : 1,
			animate : 1,
			rotation : 0,
			transX : 0,
			transY : 0,
			transZ : 0,
			orbit : 7.5,
			speed : 0.5
		},
		scene : {
			background : {
				r : 0.0,
				g : 0.0,
				b : 0.0,
				a : 1.0
			},
			currentPosition : {
				x : 0,
				y : 0,
				z : -25
			},
			zoom : {
				lower : -50,
				upper : -15
			}
		}
	},
	dom : {	},
	events : {
		clicked : 0,
		xPos 	: 0,
		yPos 	: 0,
		xRot 	: 0,
		yRot 	: 0,
		zoom 	: 0,
		xTrans 	: 0
	},
	animation : {
		start : undefined,
		current : undefined,
		previous : undefined
	}
};
var webgl;

var init = function() {
	var invalidConfiguration = function() {
		//Check the cube orbit is wide enough to avoid the sphere
		if ( global.config.cube.orbit <= global.config.sphere.radius + 2) {
			console.error("Cube orbit must be larger than sphere radius and cube width");
			return 1;
		}
	}
	var createContext = function(canvas) {
		global.canvas = WebGLDebugUtils.makeLostContextSimulatingCanvas(canvas);

		//Set the canvas context to the relevant standard
		var context = global.canvas.getContext('webgl') || global.canvas.getContext('experimental-webgl');
		
		//If no standard is set - assume browser lacks capacity - Error out
		if (!context) { 
			console.error("Your browser may be unable to handle webgl");
			return null; 
		}

		//Set the viewport height and width
		context.viewportWidth = global.canvas.width;
		context.viewportHeight = global.canvas.height;
		
		//Return a valid context object
		return context;
	}

	var setupShaders = function() {
		var loadShader = function(shaderID) {
			//Get the script element from the dom
			var script = document.getElementById(shaderID);
			
			//If we don't have a script - something went wrong - error out
			if (!script) {
				console.error("Shader script not found with id" + shaderID);
				return null;
			}

			//Extract the script source from the shader
			var source = "";
			var thisChild = script.firstChild;
			while (thisChild) {
				if (thisChild.nodeType == 3) {
					source += thisChild.textContent;
				}
				thisChild = thisChild.nextSibling;
			}

			//Create the shader
			var shader;
			switch (script.type) {
				case "x-shader/x-fragment" :
					shader = webgl.createShader(webgl.FRAGMENT_SHADER);
					break;
				case "x-shader/x-vertex" :
					shader = webgl.createShader(webgl.VERTEX_SHADER);
					break;
				default :
					//No shader type - error out
					console.error("Invalid shader type specified:" + script.type);
					return null;
			}

			//Compile the shader with the extracted source code
			webgl.shaderSource(shader,source);
			webgl.compileShader(shader);

			//Check the compile status of the shader - if it didn't compile - error out
			if (!webgl.getShaderParameter(shader,webgl.COMPILE_STATUS) && !webgl.isContextLost()) {
				console.error(webgl.getShaderInfoLog(shader));
				return null;
			}

			//Return the shader object
			return shader;
		}

		//Get the shaders
		var vertexShader = loadShader("shader-vs");
		var fragmentShader = loadShader("shader-fs");
		
		//Create the webgl program
		global.program = webgl.createProgram();

		//Attach shaders to the program
		webgl.attachShader(global.program,vertexShader);
		webgl.attachShader(global.program,fragmentShader);
		
		//Link the program
		webgl.linkProgram(global.program);

		//If link is unsuccessful - error out
		if (!webgl.getProgramParameter(global.program,webgl.LINK_STATUS) && !webgl.isContextLost()) {
			console.error("Failed to link shaders:" + webgl.getProgramInfoLog(global.program));
			return null;
		}

		//Otherwise we use the program
		webgl.useProgram(global.program);

		//Link shader attributes to global js variables
		global.vertexPositionAttributeLoc = webgl.getAttribLocation(global.program, "aVertexPosition"); 
	    global.textureCoordinateAttributeLoc = webgl.getAttribLocation(global.program,"aTextureCoord");
	    global.vertexNormalAttributeLoc = webgl.getAttribLocation(global.program, "aVertexNormal");
    	
    	//Enable shader attributes
    	webgl.enableVertexAttribArray(global.vertexPositionAttributeLoc);
    	webgl.enableVertexAttribArray(global.textureCoordinateAttributeLoc);
    	webgl.enableVertexAttribArray(global.vertexNormalAttributeLoc);

	    //Link shader uniforms to global js variables
    	global.uniformMVMatrixLoc = webgl.getUniformLocation(global.program, "uMVMatrix");
    	global.uniformProjMatrixLoc = webgl.getUniformLocation(global.program,"uPMatrix");
    	global.uniformNormalMatrixLoc = webgl.getUniformLocation(global.program,"uNMatrix");
    	global.uniformSampler = webgl.getUniformLocation(global.program,"uSampler");
    	global.ambientColor = webgl.getUniformLocation(global.program,"uAmbientColor");
    	global.directionalLight = webgl.getUniformLocation(global.program,"uLightingDirection");
    	global.diffuseColor = webgl.getUniformLocation(global.program,"uDiffuseColor");
    	global.specularColor = webgl.getUniformLocation(global.program,"uSpecularColor");
    	
		//Create modelview and projection view matrices
		global.modelViewMatrix = mat4.create();
		global.projectionViewMatrix = mat4.create();
		global.modelViewMatrixStack = [];
	}
	
	var setupBuffers = function() {
		var cubeBuffers = function() {
			var _this = global.config.cube;
			
			//If cube is disabled - don't set up buffers - return null
			if (!_this.enabled) { return null; }

	  		//Define position coordinates
	  		var position = [
	    		// Front face
	            -1.0, -1.0,  1.0,
	             1.0, -1.0,  1.0,
	             1.0,  1.0,  1.0,
	            -1.0,  1.0,  1.0,

	            // Back face
	            -1.0, -1.0, -1.0,
	            -1.0,  1.0, -1.0,
	             1.0,  1.0, -1.0,
	             1.0, -1.0, -1.0,

	            // Top face
	            -1.0,  1.0, -1.0,
	            -1.0,  1.0,  1.0,
	             1.0,  1.0,  1.0,
	             1.0,  1.0, -1.0,

	            // Bottom face
	            -1.0, -1.0, -1.0,
	             1.0, -1.0, -1.0,
	             1.0, -1.0,  1.0,
	            -1.0, -1.0,  1.0,

	            // Right face
	             1.0, -1.0, -1.0,
	             1.0,  1.0, -1.0,
	             1.0,  1.0,  1.0,
	             1.0, -1.0,  1.0,

	            // Left face
	            -1.0, -1.0, -1.0,
	            -1.0, -1.0,  1.0,
	            -1.0,  1.0,  1.0,
	            -1.0,  1.0, -1.0
	    	];

			//Create position buffer
			_this.positionBuffer = webgl.createBuffer();
			webgl.bindBuffer(webgl.ARRAY_BUFFER,_this.positionBuffer);
			webgl.bufferData(webgl.ARRAY_BUFFER, new Float32Array(position),webgl.STATIC_DRAW);
			_this.positionBuffer.itemSize = 3;
	    	_this.positionBuffer.numberOfItems = 24;

	    	//Coordinates of vertex normals
	    	var normals = [
	    	   // Front face
		       0.0,  0.0,  1.0,
		       0.0,  0.0,  1.0,
		       0.0,  0.0,  1.0,
		       0.0,  0.0,  1.0,
		
		       // Back face
		       0.0,  0.0, -1.0,
		       0.0,  0.0, -1.0,
		       0.0,  0.0, -1.0,
		       0.0,  0.0, -1.0,
		
		       // Top face
		       0.0,  1.0,  0.0,
		       0.0,  1.0,  0.0,
		       0.0,  1.0,  0.0,
		       0.0,  1.0,  0.0,
		
		       // Bottom face
		       0.0, -1.0,  0.0,
		       0.0, -1.0,  0.0,
		       0.0, -1.0,  0.0,
		       0.0, -1.0,  0.0,
		
		       // Right face
		       1.0,  0.0,  0.0,
		       1.0,  0.0,  0.0,
		       1.0,  0.0,  0.0,
		       1.0,  0.0,  0.0,
		
		       // Left face
		      -1.0,  0.0,  0.0,
		      -1.0,  0.0,  0.0,
		      -1.0,  0.0,  0.0,
		      -1.0,  0.0,  0.0
	    	];

	    	//Setup the normal buffer
	    	_this.normalBuffer = webgl.createBuffer();
	    	webgl.bindBuffer(webgl.ARRAY_BUFFER,_this.normalBuffer);
	    	webgl.bufferData(webgl.ARRAY_BUFFER,new Float32Array(normals),webgl.STATIC_DRAW);
	    	_this.normalBuffer.itemSize = 3;
	    	_this.normalBuffer.numberOfItems = 24;

		    //Setup texture coordinates - right face to use dark grey colour
		    var textureData = [
				// Front face
	            0.5, 1.0,
	            0.5, 1.0,
	            0.5, 1.0,
	            0.5, 1.0,
	
	            // Back face
	            0.5, 1.0,
	            0.5, 1.0,
	            0.5, 1.0,
	            0.5, 1.0,
	
	            // Top face
	            0.5, 1.0,
	            0.5, 1.0,
	            0.5, 1.0,
	            0.5, 1.0,
	
	            // Bottom face
	            0.5, 1.0,
	            0.5, 1.0,
	            0.5, 1.0,
	            0.5, 1.0,
	
	            // Right face
	            0.5, 1.0,
	            0.5, 1.0,
	            0.5, 1.0,
	            0.5, 1.0,
	
	            // Left face
	            0.2, 0.2,
	            0.2, 0.2,
	            0.2, 0.2,
	            0.2, 0.2
    	    ];
		    
		    //Setup texture buffer
		    _this.textureBuffer = webgl.createBuffer();
		    webgl.bindBuffer(webgl.ARRAY_BUFFER,_this.textureBuffer);
		    webgl.bufferData(webgl.ARRAY_BUFFER, new Float32Array(textureData),webgl.STATIC_DRAW);
		    _this.textureBuffer.itemSize = 2;
		    _this.textureBuffer.numberOfItems = 24;
	    	
	    	//Create the triangles
	    	var vertexIndices = [
	        	0, 1, 2,      0, 2, 3,    // Front face
            	4, 5, 6,      4, 6, 7,    // Back face
            	8, 9, 10,     8, 10, 11,  // Top face
            	12, 13, 14,   12, 14, 15, // Bottom face
            	16, 17, 18,   16, 18, 19, // Right face
            	20, 21, 22,   20, 22, 23  // Left face
		    ];        
	    	
	    	//Create the vertex buffer
	    	_this.vertexIndexBuffer = webgl.createBuffer();
	    	webgl.bindBuffer(webgl.ELEMENT_ARRAY_BUFFER, _this.vertexIndexBuffer);
	    	webgl.bufferData(webgl.ELEMENT_ARRAY_BUFFER, new Uint16Array(vertexIndices), webgl.STATIC_DRAW);
	    	_this.vertexIndexBuffer.itemSize = 1;
	    	_this.vertexIndexBuffer.numberOfItems = 36;			
		}
		var sphereBuffers = function() {
	    	var _this = global.config.sphere;
	    	
	    	//If the sphere is disabled - don't create buffers - exit out
	    	if (!_this.enabled) { return null; }

	    	//Create empty arrays
	    	var position = [];
	    	var normalData = [];
	    	var textureData = [];
	    		    	
	    	//Loop through each band of latitude and logtitude
	    	for (var i=0; i<=_this.latitudeBands; i++) {
	    		for (var j=0; j<=_this.longitudeBands; j++) {
	    			//Calculate x,y,z
	    			var x = Math.sin(i * Math.PI / _this.latitudeBands) * Math.cos(2 * j * Math.PI / _this.longitudeBands);
	    			var y = Math.cos(i * Math.PI / _this.latitudeBands);
	    			var z = Math.sin(i * Math.PI / _this.latitudeBands) * Math.sin(2 * j * Math.PI / _this.longitudeBands);

	    			//Push values of x,y,z to position and normal data
	    			position.push(_this.radius*x,_this.radius*y,_this.radius*z);
	    			normalData.push(x,y,z);

	    			//Calculate texture coordinates
	    			var u = 1 - (j/_this.longitudeBands);
	    			var v = 1 - (i/_this.latitudeBands);

	    			//Push coordinates to texture data
	    			textureData.push(u,v);
	    			
	    		}
	    	}
	    	
	    	//Create position, texture & normal buffers
	    	_this.positionBuffer = webgl.createBuffer();
	    	webgl.bindBuffer(webgl.ARRAY_BUFFER,_this.positionBuffer);
	    	webgl.bufferData(webgl.ARRAY_BUFFER,new Float32Array(position),webgl.STATIC_DRAW);
	    	_this.positionBuffer.itemSize = 3;
	    	_this.positionBuffer.numberOfItems = position.length / 3;

	    	_this.textureBuffer = webgl.createBuffer();
	    	webgl.bindBuffer(webgl.ARRAY_BUFFER,_this.textureBuffer);
	    	webgl.bufferData(webgl.ARRAY_BUFFER,new Float32Array(textureData),webgl.STATIC_DRAW);
	    	_this.textureBuffer.itemSize = 2;
	    	_this.textureBuffer.numberOfItems = textureData.length / 2;

	    	_this.normalBuffer = webgl.createBuffer();
	    	webgl.bindBuffer(webgl.ARRAY_BUFFER,_this.normalBuffer);
	    	webgl.bufferData(webgl.ARRAY_BUFFER,new Float32Array(normalData),webgl.STATIC_DRAW);
	    	_this.normalBuffer.itemSize = 3;
	    	_this.normalBuffer.numberOfItems = normalData.length / 3;

	    	//Generate triangle data
	    	var index = [];
	    	for (var i=0; i<_this.latitudeBands; i++) {
	    		for (var j=0; j<_this.longitudeBands; j++) {
	    			var v1 = i*(_this.longitudeBands+1) + j;
	    			var v2 = v1 + _this.longitudeBands + 1;
	    			var v3 = v1 + 1;
	    			var v4 = v2 + 1;

	    			index.push(v1,v2,v3,v3,v2,v4);
	    		}
	    	}

	    	//Create vertex buffer
	    	_this.vertexIndexBuffer = webgl.createBuffer();
	    	webgl.bindBuffer(webgl.ELEMENT_ARRAY_BUFFER,_this.vertexIndexBuffer);
	    	webgl.bufferData(webgl.ELEMENT_ARRAY_BUFFER,new Uint16Array(index),webgl.STATIC_DRAW);
	    	_this.vertexIndexBuffer.itemSize = 1;
	    	_this.vertexIndexBuffer.numberOfItems = index.length;			
		}

		//Create buffers for cube and sphere
		cubeBuffers();
		sphereBuffers();

	}

	var setupTextures = function() {
		var handleLoadedTexture = function(texture) {
			webgl.pixelStorei(webgl.UNPACK_FLIP_Y_WEBGL, true);
	        webgl.bindTexture(webgl.TEXTURE_2D, texture);
	        webgl.texImage2D(webgl.TEXTURE_2D, 0, webgl.RGBA, webgl.RGBA, webgl.UNSIGNED_BYTE, texture.image);
	        webgl.texParameteri(webgl.TEXTURE_2D, webgl.TEXTURE_MAG_FILTER, webgl.LINEAR);
	        webgl.texParameteri(webgl.TEXTURE_2D, webgl.TEXTURE_MIN_FILTER, webgl.LINEAR_MIPMAP_NEAREST);
	        webgl.generateMipmap(webgl.TEXTURE_2D);

	        webgl.bindTexture(webgl.TEXTURE_2D, null);
		}
		var loadTextureImage = function(ele,url) {
			//Create new texture
			ele.texture = webgl.createTexture();
			
			//Create new image
			ele.texture.image = new Image();
			
			//Defer loading texture until image has loaded
			ele.texture.image.onload = function() {
				handleLoadedTexture(ele.texture);
			}
			ele.texture.image.src = url;
		}
		var sphereTexture = function() {
			var _this = global.config.sphere;

			//Don't texture sphere if disabled
			if (!_this.enabled) { return null; }

			loadTextureImage(_this,"images/earth.jpg");			
		}
		var cubeTexture = function() {
			var _this = global.config.cube;

			//Don't texture cube if disabled
			if (!_this.enabled) { return null; }

			loadTextureImage(_this,"images/box.jpg");
		}
		
		//Create cube and sphere textures
		cubeTexture();
		sphereTexture();
	}

	var setupLights = function() {
		//Set the light direction to 5 units above the center of the screen
		webgl.uniform3f(global.directionalLight,0.0,5.0,0.0);
		
		//Set the ambient light to low
		webgl.uniform3f(global.ambientColor,0.2,0.2,0.2);
		
		//Set the diffuse light to medium
		webgl.uniform3f(global.diffuseColor,0.7,0.7,0.7);
		
		//Set the specular light to high
		webgl.uniform3f(global.specularColor,0.8,0.8,0.8);
	}

	var setupDOMNodes = function() {
		var _this = global.dom;
		
		//Store dom nodes in global variable to use later
		_this.canvas = document.getElementById("canvas");
		_this.orbitRadius = document.getElementById("orbitValue");
		_this.orbitRadiusError = document.getElementById("orbitError");
		_this.orbitSpeed = document.getElementById("orbitSpeed");
		_this.zoom = document.getElementById("zoomValue");
		_this.zoomError = document.getElementById("zoomError");
		_this.xAxisPos = document.getElementById("xPos");
	}

	var setupEvents = function() {
		//Define some shortcuts
		var _this = global.events;
		var scene = global.config.scene;
		var cube = global.config.cube;
		var sphere = global.config.sphere;
		var dom = global.dom;

		var increaseCubeOrbitRadius = function(increment) {
			cube.orbit += increment;
			dom.orbitRadius.innerHTML = cube.orbit;
			dom.orbitRadiusError.innerHTML = "";
		}
		var decreaseCubeOrbitRadius = function(increment) {
			var canDecreaseRadius = function() {
				if ( cube.orbit > sphere.radius + 2 ) { 
					return 1; 
				}
				return 0;
			}
			if ( canDecreaseRadius() ) {
				cube.orbit -= increment;
				dom.orbitRadius.innerHTML = cube.orbit;
				dom.orbitRadiusError.innerHTML = "";				
			}
			else {
				dom.orbitRadiusError.innerHTML = "Error: Unable to decrease orbit radius, would cause collision with earth";
			}
		}
		var increaseCubeOrbitSpeed = function(increment) {
			cube.speed += increment;
			dom.orbitSpeed.innerHTML = cube.speed;
		}
		var decreaseCubeOrbitSpeed = function(increment) {
			cube.speed -= increment;
			dom.orbitSpeed.innerHTML = cube.speed;
		}
		var zoomIn = function(increment) {
			var canZoomIn = function() {
				return (scene.currentPosition.z < scene.zoom.upper) ? 1 : 0;				
			}
			if ( canZoomIn() ) {
				scene.currentPosition.z += increment;
				_this.zoom += increment;				
				dom.zoom.innerHTML = calculateZoomPercentage(scene.currentPosition.z);
				dom.zoomError.innerHTML = "";
			}
			else {
				dom.zoomError.innerHTML = "Error: Unable to zoom in, upper limit reached";
			}
		}
		var zoomOut = function(increment) {
			var canZoomOut = function() {
				return (scene.currentPosition.z > scene.zoom.lower) ? 1 : 0;
			}
			if ( canZoomOut() ) {
				scene.currentPosition.z -= increment;
				_this.zoom -= increment;				
				dom.zoom.innerHTML = calculateZoomPercentage(scene.currentPosition.z);
				dom.zoomError.innerHTML = "";
			}
			else {
				dom.zoomError.innerHTML = "Error: Unable to zoom out, lower limit reached";
			}
		}
		var calculateZoomPercentage = function() {
			var _this = scene.zoom;
			var bounds = _this.upper - _this.lower;
			var diff = scene.currentPosition.z - _this.lower;
			var ratio = diff / bounds;
			return parseInt(ratio * 100) + "%";
		}
		var moveLeft = function(increment) {
			scene.currentPosition.x -= increment;
			_this.xTrans -= increment;
			dom.xAxisPos.innerHTML = scene.currentPosition.x;
		}
		var moveRight = function(increment) {
			scene.currentPosition.x += increment;
			_this.xTrans += increment;
			dom.xAxisPos.innerHTML = scene.currentPosition.x;
		}
		
		global.canvas.addEventListener('mousedown',function(evt){
	    	_this.clicked = 1;
	    	_this.xPos = evt.clientX;
	    	_this.yPos = evt.clientY;
	    });
	    //Mouseup and move events applied to document incase click off happens outside canvas space
	    document.addEventListener('mouseup',function(evt){
	    	_this.clicked = 0;
	    });
	    document.addEventListener('mousemove',function(evt){
	    	if (!_this.clicked) { return null; }
	
	    	var newX = evt.clientX;
	    	var newY = evt.clientY;
	
	    	_this.xRot = -_this.xPos + newX;
	    	_this.yRot = -_this.yPos + newY;
	
	    	_this.xPos = newX;
	    	_this.yPos = newY;
	    });
		document.addEventListener('keydown',function(evt){
			evt.preventDefault();

		  	switch (evt.keyCode) {
		  		case 33 :
		  			increaseCubeOrbitRadius(0.1);
		  			break;
		  		case 34 :
		  			decreaseCubeOrbitRadius(0.1);
		  			break;
		  		case 37 :
		  			moveLeft(0.5);
		  			break;
		  		case 38 : 
		  			zoomIn(0.5);
		  			break;
		  		case 39 :
		  			moveRight(0.5);
		  			break;
		  		case 40 :
		  			zoomOut(0.5);
		  			break;
		  		case 65 :
		  			increaseCubeOrbitSpeed(0.1);
		  			break;
		  		case 90 :
		  			decreaseCubeOrbitSpeed(0.1);
		  			break;
		  	}
	    },false);

	    //Set default parameter values
	    dom.zoom.innerHTML = calculateZoomPercentage();
	    dom.xAxisPos.innerHTML = scene.currentPosition.x;
		dom.orbitRadius.innerHTML = cube.orbit;
		dom.orbitSpeed.innerHTML = cube.speed;
	}

	var setMatrixUniforms = function() {
    	webgl.uniformMatrix4fv(global.uniformMVMatrixLoc, false, global.modelViewMatrix);
	    webgl.uniformMatrix4fv(global.uniformProjMatrixLoc, false, global.projectionViewMatrix);

	    var normalMatrix = mat3.create();
        mat4.toInverseMat3(global.modelViewMatrix, normalMatrix);
        mat3.transpose(normalMatrix);
        webgl.uniformMatrix3fv(global.uniformNormalMatrixLoc, false, normalMatrix);
	}

	var pushModelViewMatrix = function() {
    	var copyToPush = mat4.create(global.modelViewMatrix);
    	global.modelViewMatrixStack.push(copyToPush);
	}

	var popModelViewMatrix = function() {
	    if (global.modelViewMatrixStack.length == 0) {
	        throw "Error popModelViewMatrix() - Stack was empty ";
	    }
	    global.modelViewMatrix = global.modelViewMatrixStack.pop();
	}
	var draw = function() {
		var drawCube = function() {
			var _this = global.config.cube;
			
			//Don't draw cube if disabled - return null
			if (!_this.enabled) { return null; }

			if (_this.animate) {
				var elapsedTime = global.animation.current - global.animation.start;

				//Calculate angle for defining translations
				var angle = (_this.speed * elapsedTime)/2000*2*Math.PI % (2*Math.PI);
				
				//Calculate translation values on x & z axis
				_this.transX = Math.cos(angle) * _this.orbit;
				_this.transZ = Math.sin(angle) * _this.orbit;

				//Calculate rotation value
				_this.rotation = -angle;

				//Move the cube
				mat4.translate(global.modelViewMatrix,[_this.transX,_this.transY,_this.transZ],global.modelViewMatrix);

			 	//Rotate the cube
			 	mat4.rotateY(global.modelViewMatrix,_this.rotation);				
			}
						
			//Set active texture
			webgl.activeTexture(webgl.TEXTURE0);
			webgl.bindTexture(webgl.TEXTURE_2D,_this.texture);
			webgl.uniform1i(global.uniformSampler, 0);

			//position,texture & normal buffers bound as array buffers
			webgl.bindBuffer(webgl.ARRAY_BUFFER, _this.positionBuffer);
			webgl.vertexAttribPointer(global.vertexPositionAttributeLoc, _this.positionBuffer.itemSize, webgl.FLOAT, false, 0, 0);

			webgl.bindBuffer(webgl.ARRAY_BUFFER,_this.textureBuffer);
			webgl.vertexAttribPointer(global.textureCoordinateAttributeLoc,_this.textureBuffer.itemSize,webgl.FLOAT,false,0,0);

			webgl.bindBuffer(webgl.ARRAY_BUFFER,_this.normalBuffer);
			webgl.vertexAttribPointer(global.vertexNormalAttributeLoc,_this.normalBuffer.itemSize,webgl.FLOAT,false,0,0);
			
			//bind vertex buffer
			webgl.bindBuffer(webgl.ELEMENT_ARRAY_BUFFER, _this.vertexIndexBuffer);
			
			setMatrixUniforms();
			
			//Draw cube triangles
			webgl.drawElements(webgl.TRIANGLES, _this.vertexIndexBuffer.numberOfItems, webgl.UNSIGNED_SHORT, 0);
		}
		var drawSphere = function() {
			var _this = global.config.sphere;
			
			//Don't draw sphere if disabled - return null
			if (!_this.enabled) { return null; }

			if (_this.animate) {
				//Apply rotation transformation
				mat4.rotateY(global.modelViewMatrix,_this.rotation);
				
				//Increase amount to rotate for next time
				_this.rotation += 0.01;
			}
			
			//Set active texture
			webgl.activeTexture(webgl.TEXTURE0);
			webgl.bindTexture(webgl.TEXTURE_2D,_this.texture);
			webgl.uniform1i(global.uniformSampler, 0);

			//Bind position,texture & normal buffers as array buffers
			webgl.bindBuffer(webgl.ARRAY_BUFFER,_this.positionBuffer);
			webgl.vertexAttribPointer(global.vertexPositionAttributeLoc,_this.positionBuffer.itemSize,webgl.FLOAT,false,0,0);

			webgl.bindBuffer(webgl.ARRAY_BUFFER,_this.textureBuffer);
			webgl.vertexAttribPointer(global.textureCoordinateAttributeLoc,_this.textureBuffer.itemSize,webgl.FLOAT,false,0,0);

			webgl.bindBuffer(webgl.ARRAY_BUFFER,_this.normalBuffer);
			webgl.vertexAttribPointer(global.vertexNormalAttributeLoc,_this.normalBuffer.itemSize,webgl.FLOAT,false,0,0);
						
			//Bind vertex buffers
			webgl.bindBuffer(webgl.ELEMENT_ARRAY_BUFFER,_this.vertexIndexBuffer);
			
			setMatrixUniforms();
			
			//Draw the triangles
			webgl.drawElements(webgl.TRIANGLES,_this.vertexIndexBuffer.numberOfItems,webgl.UNSIGNED_SHORT,0);
		}
		
		//Shortcut to the events config
		var ev = global.events;

		//Apply left, right and zoom calculations on the projection
		//Using projection matrix as modelview matrix causes issues once scene is rotated
		mat4.translate(global.projectionViewMatrix,[ev.xTrans,0,ev.zoom]);

		//Apply mousemove translations to modelview matrix
		mat4.rotateX(global.modelViewMatrix,ev.xRot/50,global.modelViewMatrix);
		mat4.rotateY(global.modelViewMatrix,ev.yRot/50,global.modelViewMatrix);		

		//Reset event variables to prevent translations being repeated on every re-draw
		ev.xRot = ev.yRot = ev.zoom = ev.xTrans = 0;

		//Draw the cube
		//push and pop the modelview matrix so that any translations only affect the cube - not the entire scene
		pushModelViewMatrix();
		drawCube();
		popModelViewMatrix();
		
		//Draw the sphere
		pushModelViewMatrix();
		drawSphere();
		popModelViewMatrix();
	}
	var updateAnimation = function() {
		//Request another call to this function - infinite loop keeps the animation running
		requestAnimFrame(updateAnimation);

		var _this = global.animation;
		
		//Set current time
		_this.current = Date.now();

		//Set start time
		if (_this.start === undefined) {
			_this.start = _this.current;
		}

		//Clear the canvas
		webgl.clear(webgl.COLOR_BUFFER_BIT | webgl.DEPTH_BUFFER_BIT);

		//Draw the scene
		draw();
		
		//Set previous time as current time to use in next frame
		_this.previous = _this.current;
	}
	var initScene = function() {
		var _this = global.config.scene;
		
		//Set the background color
		webgl.clearColor(_this.background.r,_this.background.g,_this.background.b,_this.background.a);
		webgl.enable(webgl.DEPTH_TEST);

		webgl.viewport(0,0,webgl.viewportWidth,webgl.viewportHeight);
		
		//Clear the canvas space
		webgl.clear(webgl.COLOR_BUFFER_BIT | webgl.DEPTH_BUFFER_BIT);

		mat4.perspective(45,webgl.viewportWidth / webgl.viewportHeight,0.1,100.0,global.projectionViewMatrix);
		mat4.identity(global.modelViewMatrix);
		
		//Set the default view
		mat4.lookAt([_this.currentPosition.x,_this.currentPosition.y,_this.currentPosition.z],
			[0,0,0],[0,1,0],global.modelViewMatrix);

		updateAnimation();
	}

	//Return null if configuration is invalid
	if ( invalidConfiguration() ) { return null;}
	
	setupDOMNodes();
	webgl = createContext(global.dom.canvas);
	
	setupShaders();
	setupBuffers();
	setupTextures();
	setupLights();
	setupEvents();	

	initScene();
}

window.onload = init;