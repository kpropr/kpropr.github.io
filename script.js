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
// ❗️ (Функция изменена: больше не принимает аргументы, использует selectedRegionData)
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

  // --- ❗️ ИЗМЕНЕНО: Расчет для региона (если он "запомнен") ---
  if (selectedRegionData.pvout !== null && selectedRegionData.name !== null) {
    const pvout = selectedRegionData.pvout;
    const regionName = selectedRegionData.name;
    
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
    loadPanelData();
    console.log("📂 Загружаем данные панелей...");

    const setupInputListeners = (id, valueDisplayId) => {
        const inputElement = document.getElementById(id);
        const displayElement = document.getElementById(valueDisplayId);

        if (inputElement && displayElement) {
             if (id === 'area') {
                // (area-value нет в HTML)
             } else {
                displayElement.textContent = inputElement.value; 
             }
             
             inputElement.addEventListener('input', (e) => {
                if (id === 'area') {
                    // ...
                } else {
                    if (displayElement) displayElement.textContent = e.target.value;
                }
                // ❗️ Теперь этот вызов корректно подхватит 'selectedRegionData'
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
    setupInputListeners('area', 'area-value'); // 'area-value' нет в HTML, но код не сломается
    
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
          paint: { 'background-color': '#aee0ff' } 
        },
        {
          id: 'osm-layer',
          type: 'raster',
          source: 'osm'
        }
      ]
    },
    center: [105, 63], 
    zoom: 1.8, // ❗️ (Зум чуть уменьшен, чтобы было видно, что это сфера)
    projection: 'globe' // 🌍 <-- Эта строка делает 3D-сферу
  });

  // --- Настройка атмосферы ---
  map.on('style.load', () => {
    if (map.setFog) { 
      map.setFog({
        color: 'rgba(255,255,255,0)', 
        'space-color': 'rgb(5,5,15)', 
        'horizon-blend': 0.05 
      });
    }
  });

  // --- Загрузка GeoJSON регионов ---
  fetch('russia_regions.geojson') 
    .then(res => res.json())
    .then(data => {
      map.addSource('russia', { type: 'geojson', data });

      map.addLayer({
        id: 'russia-fill',
        type: 'fill',
        source: 'russia',
        paint: {
          'fill-color': '#b8d8ff', 
          'fill-opacity': 0.6
        }
      });

      map.addLayer({
        id: 'russia-borders',
        type: 'line',
        source: 'russia',
        paint: {
          'line-color': '#333', 
          'line-width': 1
        }
      });

      // --- Интерактивность карты ---
      map.on('mousemove', 'russia-fill', (e) => {
        map.getCanvas().style.cursor = e.features.length ? 'pointer' : '';
      });
      map.on('mouseleave', 'russia-fill', () => {
        map.getCanvas().style.cursor = '';
      });

      // ❗️ (Обработчик клика ИЗМЕНЕН)
      map.on('click', 'russia-fill', (e) => {
        if (!e.features || e.features.length === 0) return;
        
        const props = e.features[0].properties;
        
        // 1. Сохраняем данные в глобальную переменную
        selectedRegionData.name = props.name;
        selectedRegionData.pvout = props.pvout;

        // 2. Перекрашиваем регион
        map.setPaintProperty('russia-fill', 'fill-color', [
          'match',
          ['get', 'name'],
          props.name, '#ffd700', 
          '#b8d8ff' 
        ]);

        // 3. Приближаемся
        map.flyTo({
          center: e.lngLat,
          zoom: 3.8,
          speed: 0.6,
          curve: 1.2
        });

        // 4. Показываем Pop-up
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`<b>${props.name}</b><br>PVOUT: ${props.pvout} кВт·ч/кВтp/год`)
          .addTo(map);

        // 5. Запускаем расчет (он сам найдет данные в selectedRegionData)
        calculateAndDisplay();
      });
    })
    .catch(err => console.error("Ошибка загрузки карты:", err));
});
  
