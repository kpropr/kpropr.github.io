// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И НАСТРОЙКИ ===
let panelData = {};
const ELECTRICITY_TARIFF = 5.5; // Тариф на электроэнергию (руб/кВт·ч)
const SYSTEM_LOSS_FACTOR = 0.85; // Коэффициент системных потерь (15%)

// === 1. ЗАГРУЗКА ДАННЫХ МОДУЛЕЙ ===
async function loadPanelData() {
  try {
    const response = await fetch('hevel_modules.json');
    panelData = await response.json();
    console.log("✅ Данные HEVEL успешно загружены.");
    
    // Запускаем первый расчет только после загрузки данных
    // Даем небольшую задержку, чтобы UI успел прогрузиться
    setTimeout(() => {
      calculateAndDisplay();
    }, 300);
  } catch (error) {
    console.error("❌ Ошибка загрузки данных HEVEL:", error);
  }
}

// === 2. ОСНОВНАЯ ФУНКЦИЯ РАСЧЕТА ===
function calculateAndDisplay(customPvout = null, regionName = null) {
  if (!panelData || Object.keys(panelData).length === 0) {
    console.warn("Данные panelData ещё не загружены — расчёт отложен.");
    return;
  }

  // --- Считывание данных из UI ---
  const countInput = document.getElementById('count');
  const areaInput = document.getElementById('area');
  const countValueDisplay = document.getElementById('count-value');
  // Важно: в твоем HTML нет 'area-value', поэтому я добавил проверку
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
      // Обновляем максимум у слайдера
      countInput.max = maxPanels > 0 ? maxPanels : 1; 
    } catch (e) {}
    
    if (count > maxPanels) {
      count = maxPanels;
      countInput.value = count;
    }
  } else {
     // Если площадь 0, сбрасываем ограничение слайдера
     try {
       countInput.max = 50; // Возвращаем к значению по умолчанию из HTML
     } catch(e) {}
  }
  
  if (countValueDisplay) countValueDisplay.textContent = count;
  // Обновляем и отображение площади
  if (areaValueDisplay) areaValueDisplay.textContent = area ? `${area} м²` : '—';


  // --- Базовый расчет мощности ---
  const totalPowerKW = (module.max_power * count) / 1000; // кВт
  const totalPowerEl = document.getElementById('total-power');
  if (totalPowerEl) totalPowerEl.textContent = totalPowerKW.toFixed(1) + ' кВт';

  const output = document.getElementById('comparison-output');
  if (!output) return; // Выходим, если нет блока результатов

  // --- Расчет для региона (если выбран) ---
  if (customPvout !== null && regionName !== null) {
    const pvout = customPvout;
    const yearlyGeneration = totalPowerKW * pvout * SYSTEM_LOSS_FACTOR;
    const yearlySavings = yearlyGeneration * ELECTRICITY_TARIFF;
    const totalSystemCost = (module.price_rub || 0) * count;
    const paybackPeriod = yearlySavings > 0 ? totalSystemCost / yearlySavings : 'N/A';

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
    // Загружаем данные JSON при старте
    loadPanelData();
    console.log("📂 Загружаем данные панелей...");

    // Настраиваем слушателей на инпуты
    const setupInputListeners = (id, valueDisplayId) => {
        const inputElement = document.getElementById(id);
        const displayElement = document.getElementById(valueDisplayId);

        if (inputElement && displayElement) {
             // Инициализация отображаемого значения
             if (id === 'area') {
                // В HTML нет area-value, этот код может не сработать
                // displayElement.textContent = inputElement.value ? `${inputElement.value} м²` : '—';
             } else {
                displayElement.textContent = inputElement.value; 
             }
             
             // Слушатель 'input' для мгновенного отклика
             inputElement.addEventListener('input', (e) => {
                if (id === 'area') {
                    // if (displayElement) displayElement.textContent = e.target.value ? `${e.target.value} м²` : '—';
                } else {
                    if (displayElement) displayElement.textContent = e.target.value;
                }
                calculateAndDisplay(); 
             });
        } else if (inputElement) {
             // Если есть инпут, но нет дисплея для значения (как 'area')
             inputElement.addEventListener('input', () => {
                calculateAndDisplay();
             });
        }
    };

    setupInputListeners('count', 'count-value');
    setupInputListeners('area', 'area-value'); // 'area-value' нет в HTML, но код не сломается
    
    // Добавим слушателей и на 'change' для 'area',
    // т.к. 'input' для type=number может срабатывать не во всех браузерах
    const areaInput = document.getElementById('area');
    if (areaInput) {
        areaInput.addEventListener('change', () => calculateAndDisplay());
    }
});

// === 4. ГЛОБУС MAPLIBRE ===
document.addEventListener('DOMContentLoaded', () => {
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors'
        }
      },
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#aee0ff' } // Цвет океана
        },
        {
          id: 'osm-layer',
          type: 'raster',
          source: 'osm'
        }
      ]
    },
    center: [105, 63], // Центр на России
    zoom: 2.5,
    projection: 'globe' // 🌍 <--- ВОТ ЭТА СТРОКА ДЕЛАЕТ ГЛОБУС
  });

  // --- Настройка атмосферы ---
  map.on('style.load', () => {
    if (map.setFog) { // setFog доступен в новых версиях MapLibre
      map.setFog({
        color: 'rgba(255,255,255,0)', // Прозрачный туман на земле
        'space-color': 'rgb(5,5,15)', // Цвет космоса
        'horizon-blend': 0.05 // Плавность перехода к горизонту
      });
    }
  });

  // --- Загрузка GeoJSON регионов ---
  fetch('russia_regions.geojson') 
    .then(res => res.json())
    .then(data => {
      map.addSource('russia', { type: 'geojson', data });

      // Слой заливки регионов
      map.addLayer({
        id: 'russia-fill',
        type: 'fill',
        source: 'russia',
        paint: {
          'fill-color': '#b8d8ff', // Базовый цвет регионов
          'fill-opacity': 0.6
        }
      });

      // Слой границ регионов
      map.addLayer({
        id: 'russia-borders',
        type: 'line',
        source: 'russia',
        paint: {
          'line-color': '#333', // Цвет границ
          'line-width': 1
        }
      });

      // --- Интерактивность карты ---
      map.on('mousemove', 'russia-fill', (e) => {
        // Меняем курсор на "руку" при наведении
        map.getCanvas().style.cursor = e.features.length ? 'pointer' : '';
      });
      map.on('mouseleave', 'russia-fill', () => {
        map.getCanvas().style.cursor = '';
      });

      map.on('click', 'russia-fill', (e) => {
        if (!e.features || e.features.length === 0) return;
        
        const props = e.features[0].properties;
        const regionName = props.name;
        const pvout = props.pvout;

        // Перекрашиваем выбранный регион
        map.setPaintProperty('russia-fill', 'fill-color', [
          'match',
          ['get', 'name'],
          regionName, '#ffd700', // Выбранный регион - золотой
          '#b8d8ff' // Остальные - по умолчанию
        ]);

        // "Прилетаем" к региону
        map.flyTo({
          center: e.lngLat,
          zoom: 3.8,
          speed: 0.6,
          curve: 1.2
        });

        // Показываем Pop-up
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`<b>${regionName}</b><br>PVOUT: ${pvout} кВт·ч/кВтp/год`)
          .addTo(map);

        // Запуск расчета с данными региона
        calculateAndDisplay(pvout, regionName);
      });
    })
    .catch(err => console.error("Ошибка загрузки карты:", err));
});
  
