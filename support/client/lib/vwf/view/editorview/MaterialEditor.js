'use strict';

if( !Math.log10 ){
	Math.log10 = function(x){
		return Math.log(x)/Math.log(10);
	}
}

define(['./angular-app', './mapbrowser', './colorpicker', './EntityLibrary'], function(app, mapbrowser)
{
	window._MapBrowser = mapbrowser.getSingleton();

	app.controller('MaterialController', ['$scope','$timeout', function($scope, $timeout)
	{
		/*
		 * Scope variables
		 */

		// These three properties sync directly with the selected object's materialDef property.
		// If that property is a single definition object, then it's assigned to materialDef.
		// If it's an array of definitions, the array is assigned to materialArray, and materialDef
		// is assigned to the object at index activeMaterial
		$scope.materialDef = null;
		$scope.materialArray = null;
		$scope.activeMaterial = 0;

		$scope.ambientLinked = true;     // determines whether the ambient color should be updated along with diffuse
		var oldMaterialDef = null;       // makes sure setProperty isn't called when the selection changes
		$scope.videoTextureSource = '';  // value buffer between the input box and materialDef.videosrc
		var lastUndo = null;             // a snapshot of materialDef before live preview setProperty's
		

		/*
		 * Angular watches
		 */

		// check for upstream materialDef changes when this value updates
		$scope.$watchGroup(['fields.selectedNode.id','fields.selectedNode.properties.materialDef'], refresh);

		// repoint materialDef when it's an array and the active material changes
		$scope.$watch('activeMaterial', function(newval){
			if( $scope.materialArray && newval >= 0 && newval < $scope.materialArray.length ){
				$scope.materialDef = $scope.materialArray[newval];
			}
		});

		// apply changes to the diffuse color to the ambient color too when they're linked
		$scope.$watch('ambientLinked && materialDef.color.r + materialDef.color.g + materialDef.color.b', function(newval){
			if(newval){
				$scope.materialDef.ambient.r = $scope.materialDef.color.r;
				$scope.materialDef.ambient.b = $scope.materialDef.color.b;
				$scope.materialDef.ambient.g = $scope.materialDef.color.g;
			}
		});

		$scope.$watch('materialDef.color.a', function(newval){
			if(newval !== undefined){
				$scope.materialDef.alpha = newval;
			}
		});
		$scope.$watch('materialDef.specularColor.a', function(newval){
			if(newval !== undefined){
				$scope.materialDef.specularLevel = newval;
			}
		});

		// recursively watch materialDef, and setProperty if changes were made by the material editor
		var handle = null;
		$scope.$watch('materialArray || materialDef', function(newval)
		{
			if(newval && (newval === oldMaterialDef || Array.isArray(oldMaterialDef) && oldMaterialDef.indexOf(newval) > -1)){
				applyDef(newval);
			}

			if( $scope.materialDef )
				$scope.videoTextureSource = $scope.materialDef.videosrc;

			oldMaterialDef = newval;
		}, true);


		/*
		 * Methods
		 */

		// populate the material definition with any default properties it's missing
		function materialWithDefaults(mat)
		{
			// set defaults
			if( mat.type === undefined )
				mat.type = 'phong';
			if( mat.side === undefined )
				mat.side = 0;
			if( mat.blendMode === undefined )
				mat.blendMode = 1;

			if( mat.fog === undefined )
				mat.fog = true;
			if( mat.shading === undefined )
				mat.shading = true;
			if( mat.metal === undefined )
				mat.metal = false;
			if( mat.wireframe === undefined )
				mat.wireframe = false;
			if( mat.depthtest === undefined )
				mat.depthtest = true;
			if( mat.depthwrite === undefined )
				mat.depthwrite = true;
			if( mat.vertexColors === undefined )
				mat.vertexColors = false;

			if( mat.layers === undefined )
				mat.layers = [];

			return mat;
		}

		// validate and apply changes to the material definition
		var applyHandle = null;
		function applyDef(def)
		{
			if(applyHandle) clearTimeout(applyHandle);
			applyHandle = setTimeout(function(){
				applyDef_internal(def);
				applyHandle = null;
			}, 100);
		}

		function applyDef_internal(def)
		{
			console.log('applying material');
			if( _UserManager.GetCurrentUserName() == null ){
				_Notifier.notify('You must log in to participate');
			}
			else
			{
				var undoEvent = new _UndoManager.CompoundEvent();
				for(var i=0; i<$scope.fields.selectedNodeIds.length; i++)
				{
					var id = $scope.fields.selectedNodeIds[i];

					if(_PermissionsManager.getPermission(_UserManager.GetCurrentUserName(), id) == 0){
						_Notifier.notify('You do not have permission to edit this material');
					}
					else {
						undoEvent.push( new _UndoManager.SetPropertyEvent(id, 'materialDef', def, lastUndo) );
						vwf_view.kernel.setProperty(id, 'materialDef', def);
					}
				}

				if($scope.fields.selectedNodeIds.length === 1)
					_UndoManager.pushEvent(undoEvent.list[0]);
				else
					_UndoManager.pushEvent(undoEvent);

				lastUndo = angular.copy(def);
			}
		}

		// determine if $scope.materialDef requires resyncing with the vwf
		function refresh()
		{
			// try to get a materialDef from property, or failing that, from the driver
			var mat = $scope.fields.selectedNode && vwf.getProperty($scope.fields.selectedNode.id, 'materialDef');

			if( mat && !angular.equals($scope.materialArray||$scope.materialDef, mat))
			{
				lastUndo = angular.copy(mat);

				if( angular.isArray(mat) ){
					$scope.materialArray = mat.map(function(val){ return materialWithDefaults(val); });
					$scope.activeMaterial = 0;
					$scope.materialDef = materialWithDefaults(mat[0]);
				}
				else {
					$scope.materialArray = null;
					$scope.activeMaterial = 0;
					$scope.materialDef = materialWithDefaults(mat);
				}

				var diffuse = $scope.materialDef.color, ambient = $scope.materialDef.ambient;
				$scope.ambientLinked = diffuse.r === ambient.r && diffuse.g === ambient.g && diffuse.b === ambient.b;
			}

			// if there's no selection, or a node with no materialDef is selected, disable everything
			else if( !mat ){
				$scope.materialArray = null;
				$scope.activeMaterial = 0;
				$scope.materialDef = null;
				$scope.ambientLinked = true;
				lastUndo = null;
				$('#materialEditor html-palette').css('background', '#aaaaaa');
				//_SidePanel.hideTab('materialEditor');
			}
		}
		$scope.refresh = refresh;

		// push a new default texture layer to materialDef.layers, and open the accordion tab
		$scope.addTexture = function()
		{
			if($scope.materialDef && $scope.materialDef.layers)
			{
				$scope.materialDef.layers.push({
					src: 'white.png',
					mapTo: 1,
					mapInput: 0,
					alpha: 1,
					scalex: 1,
					scaley: 1,
					offsetx: 0,
					offsety: 0,
					rot: 0
				});
				$timeout(function(){
					$('#materialaccordion').accordion('option','active',2+$scope.materialDef.layers.length-1);
				});
			}
		}

		// splice out the texture layer at the given index
		$scope.removeTexture = function(index){
			if( $scope.materialDef && $scope.materialDef.layers ){
				$scope.materialDef.layers.splice(index,1);
			}
		}

		// open the texture browser, and apply the selection to the layer at the given index
		$scope.browseForTexture = function(index)
		{
			if( window._MapBrowser ){
				window._MapBrowser.setTexturePickedCallback(function(url){
					$scope.materialDef.layers[index].src = url;
					$scope.$apply();

					window._MapBrowser.hide();
				});

				window._MapBrowser.show();
			}
			else {
				console.log('Texture browser is unavailable');
			}
		}

		window._MaterialEditor = $scope;
	}]);


	/*
	 * A reusable slider widget, with paired number input and optional exponential notation
	 */

	app.directive('slider', function()
	{
		return {
			restrict: 'E',
			template: [
				'<div class="mantissa">',
					'<div class="slider"></div>',
					'<input type="number" min="{{min}}" max="{{max}}" step="{{step}}" ng-model="mantissa" ng-disabled="disabled"></input>',
				'</div>',
				'<div class="exponent" ng-show="useExponent">',
					'Exponent: ',
					'<input type="number" min="0" step="1" ng-model="exponent" ng-disabled="disabled"></input>',
				'</div>',
			].join(''),
			scope: {
				// standard input config options
				min: '=',
				max: '=',
				step: '=',

				useExponent: '=',  // determine if the final value should be represented in exponential notation
				value: '=',        // two-way binding for the final value of the widget
				disabled: '=',     // determines if the widget should accept input
				sliding: '='       // true iff the user is dragging the slider
			},
			link: function($scope, elem, attrs)
			{
				// initialize the jquery ui slider
				var slider = $('.slider', elem);
				slider.slider({
					min: $scope.min,
					max: $scope.max,
					step: $scope.step,
					value: $scope.value
				});

				// clean up
				$scope.$on('$destroy', function(){
					if(slider.slider('instance'))
						slider.slider('destroy');
				});

				// update the value when sliding
				slider.on('slide', function(evt, ui){
					$scope.mantissa = ui.value;
					$scope.$apply();
				});

				// update sliding status
				slider.on('slidestart', function(evt,ui){
					$scope.freezeExponent = true;
					$scope.sliding = true;
					$scope.$apply();
				});
				slider.on('slidestop', function(evt,ui){
					$scope.freezeExponent = false;
					$scope.sliding = false;
					$scope.$apply();
				});

				// break value into a mantissa and exponent if appropriate, such that value = mantissa * pow(10,exponent)
				$scope.$watch('freezeExponent || value', function(newval)
				{
					if($scope.value !== undefined)
					{
						if( $scope.useExponent )
						{
							if( !$scope.freezeExponent ){
								$scope.exponent = $scope.useExponent ? Math.max(Math.floor(Math.log10(Math.abs($scope.value))), 0) : 0;
							}

							$scope.mantissa = $scope.value / Math.pow(10,$scope.exponent);
						}
						else
							$scope.mantissa = $scope.value;
					}
					else {
						$scope.mantissa = 0;
						$scope.exponent = 0;
					}
				});

				// compute new output value when mantissa or exponent are updated
				$scope.$watch('mantissa + exponent', function(newval){
					if( !$scope.disabled ){
						if( $scope.useExponent )
							$scope.value = $scope.mantissa * Math.pow(10, $scope.exponent);
						else
							$scope.value = $scope.mantissa;

						slider.slider('option', 'value', $scope.mantissa);
					}
				});

				// disable everything when true
				$scope.$watch('disabled', function(newval){
					if( newval ){
						slider.slider('disable');
						slider.slider('option', 'value', $scope.min);
					}
					else
						slider.slider('enable');
				});
			}
		};
	});


	/*
	 * Reusable angular wrapper around the color picker
	 */

	app.directive('colorPicker', ['$timeout', function($timeout)
	{
		return {
			restrict: 'E',
			template: '<div class="colorPickerIcon"></div>',
			scope: {
				colorObj: '=',
				disabled: '=',
				sliding: '='
			},
			link: function($scope, elem, attrs)
			{
				// set color of icon when upstream color changes
				$scope.$watch('colorObj.r + colorObj.b + colorObj.g', function(newval){
					$('.colorPickerIcon', elem).css('background-color', '#'+color());
				});

				
				function color(hexval)
				{
					// convert and set upstream color when arg is supplied
					if(hexval && $scope.colorObj)
					{
						var parsed = parseInt(hexval, 16);
						$scope.colorObj.r = ((parsed & 0xff0000) >> 16)/255;
						$scope.colorObj.g = ((parsed & 0x00ff00) >>  8)/255;
						$scope.colorObj.b = ((parsed & 0x0000ff)      )/255;

						if(handle) $timeout.cancel(handle);
						var handle = $timeout($scope.$apply.bind($scope), 300);
						return hexval;
					}
					// convert and return upstream color without arg
					else if($scope.colorObj)
					{
						var parsed = (Math.floor($scope.colorObj.r * 255) << 16)
							| (Math.floor($scope.colorObj.g * 255) << 8)
							| Math.floor($scope.colorObj.b * 255);

						return ('000000'+parsed.toString(16)).slice(-6);
					}
					// default to grey
					else
						return 'aaaaaa';
				}

				// initialize color picker widget
				var handle = null;
				elem.ColorPicker({
					onShow: function(e){
						$(e).fadeIn();
					},
					onHide: function(e){
						$(e).fadeOut();
						return false;
					},
					// set color picker initial color before opening
					onBeforeShow: function(){
						elem.ColorPickerSetColor(color());
					},
					// set upstream color when new color is picked
					onChange: function(hsb, hex, rgb, el){
						$scope.sliding = true;
						color(hex);

						if(handle) $timeout.cancel(handle);
						handle = $timeout(function(){ $scope.sliding = false; }, 500);
					}
				});

				// disable
				$scope.$watch('disabled', function(newval){
					if(newval){
						elem.css('pointer-events', 'none');
					}
					else {
						elem.css('pointer-events', '');
					}
				});

				// clean up color picker
				elem.bind('$destroy', function(){
					if( elem.data('colorpickerId') ){
						$('#'+elem.data('colorpickerId')).remove();
						elem.removeData('colorpickerId');
					}
				});
			}
		};
	}]);

	// convert select box value to number
	app.directive('convertToNumber', function()
	{
		return {
			require: 'ngModel',
			restrict: 'A',
			link: function($scope, elem, attrs, ngModel)
			{
				ngModel.$parsers.push(function(val){
					return parseInt(val, 10);
				});
				ngModel.$formatters.push(function(val){
					return '' + val;
				});
			}
		};
	});
});

