document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById("theme-toggle");
    const body = document.body;

    if (!toggleBtn) return;

    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) body.classList.toggle("dark", savedTheme === "dark");

    toggleBtn.textContent = body.classList.contains("dark") ? "☀️" : "🌙";

    toggleBtn.addEventListener("click", () => {
        body.classList.toggle("dark");
        const isDark = body.classList.contains("dark");

        toggleBtn.textContent = isDark ? "☀️" : "🌙";
        localStorage.setItem("theme", isDark ? "dark" : "light");
    });
});

// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КОНСТАНТЫ ===
let panelData = {};
const ELECTRICITY_TARIFF = 5.5; 
const SYSTEM_LOSS_FACTOR = 0.85; 

// Хранилище для данных выбранного региона
let selectedRegionData = {
  pvout: null,
  name: null
};

// === БЛОК 1: ЗАГРУЗКА ДАННЫХ МОДУЛЕЙ HEVEL ===
async function loadPanelData() {
  try {
    const response = await fetch('hevel_modules.json');
    panelData = await response.json();
    setTimeout(() => {
      calculateAndDisplay();
    }, 300);
  } catch (error) {
    console.error("❌ Ошибка загрузки данных HEVEL:", error);
  }
}

// === БЛОК 2: ОСНОВНАЯ ФУНКЦИЯ РАСЧЕТА ===
function calculateAndDisplay() {
  if (!panelData || Object.keys(panelData).length === 0) return;

  const countInput = document.getElementById('count');
  const areaInput = document.getElementById('area');
  const countValueDisplay = document.getElementById('count-value');
  const areaValueDisplay = document.getElementById('area-value'); 

  if (!countInput) return;

  const selectedModelId = 'HVL-450-HJT'; 
  let count = parseInt(countInput.value, 10) || 0;
  const area = parseFloat(areaInput?.value || 0);

  const module = panelData[selectedModelId];
  if (!module) return;

  // Ограничение по площади
  const PANEL_AREA_M2 = 2.1; 
  let maxPanels = Infinity;
  if (area > 0) {
    maxPanels = Math.floor(area / PANEL_AREA_M2);
    if (maxPanels < 1) maxPanels = 0;
    try {
      countInput.max = maxPanels > 0 ? maxPanels : 1; 
    } catch (e) {}
    
    if (count > maxPanels) {
      count = maxPanels;
      countInput.value = count;
    }
  } else {
     try {
       countInput.max = 50; 
     } catch(e) {}
  }
  
  if (countValueDisplay) countValueDisplay.textContent = count;
  if (areaValueDisplay) areaValueDisplay.textContent = area ? `${area} м²` : '—';

  // Расчет мощности
  const totalPowerKW = (module.max_power * count) / 1000;
  const totalPowerEl = document.getElementById('total-power');
  if (totalPowerEl) totalPowerEl.textContent = totalPowerKW.toFixed(1) + ' кВт';

  const output = document.getElementById('comparison-output');
  if (!output) return;

  // Расчет для выбранного региона
  if (selectedRegionData.pvout !== null && selectedRegionData.name !== null) {
    const pvout = selectedRegionData.pvout;
    const regionName = selectedRegionData.name;
    const pvoutNum = parseFloat(pvout);
    
    const yearlyGeneration = totalPowerKW * pvoutNum * SYSTEM_LOSS_FACTOR;
    const yearlySavings = yearlyGeneration * ELECTRICITY_TARIFF;
    const totalSystemCost = (module.price_rub || 0) * count;
    const paybackPeriod = yearlySavings > 0 ? totalSystemCost / yearlySavings : '—';

    output.innerHTML = `
        <h3>${regionName}</h3>
        <p>Инсоляция (PVOUT): ${pvout} кВт·ч/кВтp/год</p>
        <p><strong>Выработка:</strong> ${Math.round(yearlyGeneration).toLocaleString('ru-RU')} кВт·ч</p>
        <p><strong>Экономия:</strong> ${Math.round(yearlySavings).toLocaleString('ru-RU')} ₽/год</p>
        <p><strong>Окупаемость:</strong> ${typeof paybackPeriod === 'number' ? paybackPeriod.toFixed(1) + ' лет' : '—'}</p>
      `;
    
  } else {
    // Если регион НЕ выбран
    output.innerHTML = `
        <p style="opacity:0.8; font-style:italic; color:#777;">
          🗺️ Пожалуйста, выберите область на карте, чтобы рассчитать показатели.
        </p>
      `;
  }
}
// === БЛОК 3: ОБРАБОТЧИКИ UI (слайдеры) ===
document.addEventListener('DOMContentLoaded', () => {
    loadPanelData();

    const setupInputListeners = (id, valueDisplayId) => {
        const inputElement = document.getElementById(id);
        const displayElement = document.getElementById(valueDisplayId);

        if (inputElement) {
             if (displayElement) displayElement.textContent = inputElement.value;
             
             inputElement.addEventListener('input', () => {
                if (displayElement) displayElement.textContent = inputElement.value;
                calculateAndDisplay(); 
             });
             if (id === 'area') {
                 inputElement.addEventListener('change', () => calculateAndDisplay());
             }
        }
    };

    setupInputListeners('count', 'count-value');
    setupInputListeners('area', 'area-value'); 
});

// === БЛОК 4: 3D ГЛОБУС CESIUMJS И ИНТЕРАКТИВНОСТЬ ===
document.addEventListener('DOMContentLoaded', () => {
    // 1. Инициализация 3D-вьювера с отключением всех виджетов
    const viewer = new Cesium.Viewer('map', {
        imageryProvider: false,
        baseLayerPicker: false, 
        geocoder: false,             
        homeButton: false,           
        sceneModePicker: false,      
        navigationHelpButton: false, 
        animation: false,            
        timeline: false,             
        infoBox: false,              
        selectionIndicator: false,   
        fullscreenButton: false      
    });
    // 🟢 НОВЫЕ НАСТРОЙКИ НАВИГАЦИИ

    // 1. Ограничиваем высоту камеры (в метрах)
    // Мин. высота 100 км, Макс. высота 20 000 км
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 100000;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 20000000;

    // 2. Снижаем чувствительность вращения/перемещения (меньше = медленнее)
    // Значение по умолчанию обычно 3.0
    viewer.scene.screenSpaceCameraController.rotateEventMask = Cesium.ScreenSpaceEventType.LEFT_DOWN;
    viewer.scene.screenSpaceCameraController.rotateEventMask = Cesium.ScreenSpaceEventType.LEFT_DOWN;
    viewer.scene.screenSpaceCameraController.zoomEventMask = Cesium.ScreenSpaceEventType.RIGHT_DOWN;
    
    // Снижение множителя скорости вращения/масштабирования (по умолчанию: 1.0)
    viewer.scene.screenSpaceCameraController.enableTilt = true; // Разрешаем наклон
    viewer.scene.screenSpaceCameraController.tiltEventMask = [Cesium.ScreenSpaceEventType.MIDDLE_DOWN, Cesium.ScreenSpaceEventType.PINCH];
    viewer.scene.screenSpaceCameraController.constrainedZAxis = false;
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = false; // Отключаем, чтобы камера не "прыгала"

    // 3. Устанавливаем инерцию для более плавного движения
    viewer.scene.screenSpaceCameraController.inertiaSpin = 0.5; // Снижаем инерцию
    viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.5;
    viewer.scene.screenSpaceCameraController.inertiaZoom = 0.5;

    // Настройки для черного/темного глобуса
    viewer.scene.backgroundColor = Cesium.Color.BLACK;
    viewer.scene.globe.baseColor = Cesium.Color.BLACK;
    viewer.scene.skyBox.show = false; 
    viewer.scene.sun.show = false;
    viewer.scene.moon.show = false;

    // Используем темные тайлы CartoDB Dark Matter для контуров стран
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
        url: 'https://tiles.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        credit: 'CartoDB Dark Matter, OpenStreetMap'
    }));

    // Установка начального вида на Россию
    viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(105, 60, 10000000)
    });

    // 2. Загрузка GeoJSON регионов
    const geoJsonPromise = Cesium.GeoJsonDataSource.load('russia_regions.geojson', {
        stroke: Cesium.Color.WHITE,          // Границы
        fill: Cesium.Color.DARKGREY.withAlpha(0.5), 
        strokeWidth: 2,
        clampToGround: true
    });

    geoJsonPromise.then(dataSource => {
        viewer.dataSources.add(dataSource);
        const entities = dataSource.entities.values;

        // 3. Обработчик клика
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((click) => {
            const pickedObject = viewer.scene.pick(click.position);

            // Сброс всех регионов к исходному цвету
            entities.forEach((e) => {
                if (e.polygon) {
                    e.polygon.material = Cesium.Color.DARKGREY.withAlpha(0.5);
                }
            });
            // Если попали в регион
            if (Cesium.defined(pickedObject) && Cesium.defined(pickedObject.id) && pickedObject.id.polygon) {
                const entity = pickedObject.id;

                if (entity.properties && entity.properties.name) {
                    const props = entity.properties;
                    const regionName = props.name.getValue();
                    const pvoutValue = props.pvout ? props.pvout.getValue() : null;

                    selectedRegionData.name = regionName;
                    selectedRegionData.pvout = pvoutValue;

                    // Выделяем выбранный регион
                    entity.polygon.material = Cesium.Color.GOLD.withAlpha(0.8);

                    // Приближаемся к региону
                    viewer.flyTo(entity, {
                        duration: 1.5
                    });

                    calculateAndDisplay();
                }
            } else {
                 // Клик мимо региона - сброс выбора
                 selectedRegionData.name = null;
                 selectedRegionData.pvout = null;
                 calculateAndDisplay();
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    }).catch(error => {
        console.error("Ошибка загрузки GeoJSON в Cesium:", error);
    });
});

