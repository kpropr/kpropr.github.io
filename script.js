// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И НАСТРОЙКИ ===
let panelData = {};
const ELECTRICITY_TARIFF = 5.5; // Тариф на электроэнергию (руб/кВт·ч)
const SYSTEM_LOSS_FACTOR = 0.85; // Коэффициент системных потерь (15%)

// ❗️ Хранилище для выбранного региона (чтобы не сбрасывалось)
let selectedRegionData = {
  pvout: null,
  name: null
};

// === 1. ЗАГРУЗКА ДАННЫХ МОДУЛЕЙ ===
async function loadPanelData() {
  try {
    const response = await fetch('hevel_modules.json');
    panelData = await response.json();
    console.log("✅ Данные HEVEL успешно загружены.");
    
    setTimeout(() => {
      calculateAndDisplay();
    }, 300);
  } catch (error) {
    console.error("❌ Ошибка загрузки данных HEVEL:", error);
  }
}

// === 2. ОСНОВНАЯ ФУНКЦИЯ РАСЧЕТА ===
function calculateAndDisplay() {
  if (!panelData || Object.keys(panelData).length === 0) {
    console.warn("Данные panelData ещё не загружены — расчёт отложен.");
    return;
  }

  // --- Считывание данных из UI ---
  const countInput = document.getElementById('count');
  const areaInput = document.getElementById('area');
  const countValueDisplay = document.getElementById('count-value');
  const areaValueDisplay = document.getElementById('area-value'); 

  if (!countInput) return;

  const selectedModelId = 'HVL-450-HJT'; 
  let count = parseInt(countInput.value, 10) || 0;
  const area = parseFloat(areaInput?.value || 0);

  const module = panelData[selectedModelId];
  if (!module) {
    console.warn("Модель панели не найдена:", selectedModelId);
    return;
  }

  // --- Ограничение по площади ---
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
       countInput.max = 50; // Сброс на значение по умолчанию
     } catch(e) {}
  }
  
  if (countValueDisplay) countValueDisplay.textContent = count;
  if (areaValueDisplay) areaValueDisplay.textContent = area ? `${area} м²` : '—';


  // --- Базовый расчет мощности ---
  const totalPowerKW = (module.max_power * count) / 1000; // кВт
  const totalPowerEl = document.getElementById('total-power');
  if (totalPowerEl) totalPowerEl.textContent = totalPowerKW.toFixed(1) + ' кВт';

  const output = document.getElementById('comparison-output');
  if (!output) return;

  // --- Расчет для региона (если он "запомнен") ---
  if (selectedRegionData.pvout !== null && selectedRegionData.name !== null) {
    const pvout = selectedRegionData.pvout;
    const regionName = selectedRegionData.name;
    
    // Убедимся, что pvout является числом перед расчетом
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
    // --- Если регион НЕ выбран ---
    output.innerHTML = `
        <p style="opacity:0.8; font-style:italic; color:#777;">
          🗺️ Пожалуйста, выберите область на карте, чтобы рассчитать показатели.
        </p>
      `;
  }
}

// === 3. ОБРАБОТЧИКИ СОБЫТИЙ (СЛАЙДЕРЫ) ===
document.addEventListener('DOMContentLoaded', () => {
    loadPanelData();
    console.log("📂 Загружаем данные панелей...");

    const setupInputListeners = (id, valueDisplayId) => {
        const inputElement = document.getElementById(id);
        const displayElement = document.getElementById(valueDisplayId);

        if (inputElement && displayElement) {
             if (id === 'area') {
                // ...
             } else {
                displayElement.textContent = inputElement.value; 
             }
             
             inputElement.addEventListener('input', (e) => {
                if (id === 'area') {
                    // ...
                } else {
                    if (displayElement) displayElement.textContent = e.target.value;
                }
                calculateAndDisplay(); 
             });
        } else if (inputElement) {
             // Слушатель для инпутов без 'valueDisplay' (как 'area')
             inputElement.addEventListener('input', () => {
                calculateAndDisplay();
             });
        }
    };

    setupInputListeners('count', 'count-value');
    setupInputListeners('area', 'area-value'); 
    
    const areaInput = document.getElementById('area');
    if (areaInput) {
        areaInput.addEventListener('change', () => calculateAndDisplay());
    }
});

// === 4. 3D ГЛОБУС CESIUMJS ===
document.addEventListener('DOMContentLoaded', () => {
    // Cesium.ION_DEFAULT_ACCESS_TOKEN = 'your_token_if_needed'; // Если используете Ion Assets

    // 1. Инициализация 3D-вьювера в контейнере с ID 'map'
    const viewer = new Cesium.Viewer('map', {
        // Настройки для темного/черного глобуса
        imageryProvider: false, // Отключаем стандартные тайлы (чтобы глобус был черный)
        baseLayerPicker: false, // Отключаем виджет выбора слоев
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        animation: false,
        timeline: false
    });
    
    // Дополнительные настройки для "космического" темного вида
    viewer.scene.backgroundColor = Cesium.Color.BLACK;
    viewer.scene.globe.baseColor = Cesium.Color.BLACK;
    viewer.scene.skyBox.show = false;
    viewer.scene.sun.show = false;
    viewer.scene.moon.show = false;

    // Опционально: Используем темные OSM тайлы, если нужны контуры стран (внешний сервис)
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
        url: 'https://tiles.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        credit: 'CartoDB Dark Matter, OpenStreetMap'
    }));

    // 2. Установка начального вида на Россию
    viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(105, 60, 10000000)
    });

    let russiaDataSource = null;
    
    // 3. Загрузка GeoJSON регионов
    const geoJsonPromise = Cesium.GeoJsonDataSource.load('russia_regions.geojson', {
        stroke: Cesium.Color.WHITE, // Границы
        fill: Cesium.Color.DARKGREY.withAlpha(0.5), // Заливка
        strokeWidth: 2,
        clampToGround: true // Прижать к глобусу
    });

    geoJsonPromise.then(dataSource => {
        viewer.dataSources.add(dataSource);
        russiaDataSource = dataSource;

        const entities = dataSource.entities.values;

        // 4. Обработчик клика (Picking)
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((click) => {
            const pickedObject = viewer.scene.pick(click.position);

            // Сброс всех регионов к исходному цвету
            entities.forEach((e) => {
                if (e.polygon) {
                    e.polygon.material = Cesium.Color.DARKGREY.withAlpha(0.5);
                }
            });
            
            // Если попали в объект (регион)
            if (Cesium.defined(pickedObject) && Cesium.defined(pickedObject.id) && pickedObject.id.polygon) {
                const entity = pickedObject.id;

                if (entity.properties && entity.properties.name) {
                    const props = entity.properties;
                    // Данные GeoJSON в Cesium оборачиваются в Property, нужно получить значение
                    const regionName = props.name.getValue();
                    const pvoutValue = props.pvout ? props.pvout.getValue() : null;

                    // 1. Сохраняем данные
                    selectedRegionData.name = regionName;
                    selectedRegionData.pvout = pvoutValue;

                    // 2. Выделяем выбранный регион
                    entity.polygon.material = Cesium.Color.GOLD.withAlpha(0.8);

                    // 3. Приближаемся к региону
                    viewer.flyTo(entity, {
                        duration: 1.5
                    });

                    // 4. Запускаем расчет
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
