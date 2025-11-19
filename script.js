// script.js — подбор комплектов СЭС по потреблению, площади и региону
// Требует: leaflet (если используешь карту), russia_regions.geojson в корне проекта (опционально)

// -----------------------------
// Конфигурация комплектов СЭС
// -----------------------------
const KITS = [
  { id: 'kit-1', name: '1 кВт', power_kW: 1, area_m2: 8, price_rub: 114990 },
  { id: 'kit-5', name: '5 кВт', power_kW: 5, area_m2: 35, price_rub: 344490 },
  { id: 'kit-10', name: '10 кВт', power_kW: 10, area_m2: 74, price_rub: 677490 }
];

const SYSTEM_LOSS = 0.8; // коэффициент потерь (см. обсуждение)
const SUN_EQUIV_HOURS = 3.5; // используется только для подсказок/проверок, основной расчёт — по PVOUT

// -----------------------------
// Список приборов (средние данные)
// значения в кВт и часов (kW * hours = kWh/день)
// -----------------------------
const APPLIANCES = [
  { id: 'kettle', name: 'Электрочайник', power_kW: 2.0, hours: 0.166, note: '≈10 мин' }, // 0.333 kWh
  { id: 'microwave', name: 'Микроволновка', power_kW: 1.5, hours: 0.166, note: '≈10 мин' }, // 0.25
  { id: 'iron', name: 'Утюг', power_kW: 1.8, hours: 0.333, note: '≈20 мин' }, // 0.6
  { id: 'stove', name: 'Электроплита', power_kW: 4.5, hours: 0.667, note: '≈40 мин' }, // 3.0
  { id: 'fridge', name: 'Холодильник', power_kW: 0.2, hours: 8, note: 'работает циклично' }, // 1.6
  { id: 'ac', name: 'Кондиционер', power_kW: 1.0, hours: 5, note: 'летний режим' }, // 5.0
  { id: 'washer', name: 'Стиральная машина', power_kW: 2.0, hours: 1, note: 'за стирку' }, // 2.0
  { id: 'oven', name: 'Духовка', power_kW: 2.4, hours: 1, note: 'за включение' }, // 2.4
  { id: 'lighting', name: 'Освещение (LED)', power_kW: 0.1, hours: 5, note: 'общая подсветка' }, //0.5
  { id: 'pc', name: 'Компьютер', power_kW: 0.25, hours: 4, note: 'рабочие часы' } //1.0
];

// -----------------------------
// Переменные для региона/карты
// -----------------------------
let pvoutByRegion = {};   // { regionName: pvout }
let selectedRegionName = null;

// -----------------------------
// DOM селекторы (попробуем найти, если нет — создадим предупреждение)
// -----------------------------
const $ = id => document.getElementById(id);

const areaInput = $('panelArea');      // площадь в м²
const appliancesContainer = $('appliances');
const tariffInput = $('tariff');      // руб/кВт·ч
const resultsContainer = $('calc-results');
const regionHint = $('select-region-hint'); // опционально
const installTypeContainer = $('install-type'); // опционально (roof/ground radios)

// Проверки
if (!resultsContainer) {
  console.warn('script.js: элемент #calc-results не найден. Добавьте его в calculator.html');
}
if (!appliancesContainer) {
  console.warn('script.js: элемент #appliances не найден. Скрипт попытается его создать.');
}

// -----------------------------
// Инициализация UI: заполняем список приборов
// -----------------------------
function renderAppliancesList() {
  let container = appliancesContainer;
  if (!container) {
    // если контейнера нет — создаём под results (fallback)
    container = document.createElement('div');
    container.id = 'appliances';
    const settings = document.querySelector('.settings') || document.body;
    settings.appendChild(container);
    console.warn('script.js: #appliances отсутствовал — создан динамически внутри .settings');
  }

  container.innerHTML = ''; // очистка
  APPLIANCES.forEach(app => {
    const row = document.createElement('div');
    row.className = 'appliance-row';
    row.style.marginBottom = '8px';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = `app-${app.id}`;
    cb.dataset.appId = app.id;

    const label = document.createElement('label');
    label.htmlFor = cb.id;
    label.style.marginLeft = '8px';
    label.innerHTML = `<strong>${app.name}</strong> — ${ (app.power_kW * app.hours).toFixed(2) } kWh/день <span style="color:#666">(${app.note})</span>`;

    row.appendChild(cb);
    row.appendChild(label);
    container.appendChild(row);
  });
}

// -----------------------------
// Вспомогательные расчёты
// -----------------------------
function computeDailyConsumption(selectedIds) {
  // возвращает { daily_kwh, peak_kw }
  let daily = 0;
  let peak_kw = 0;
  APPLIANCES.forEach(app => {
    if (selectedIds.includes(app.id)) {
      daily += app.power_kW * app.hours;
      // для пиков — просто используем мощность прибора как потенциальный пик
      peak_kw += app.power_kW;
    }
  });
  // peak_kw - это сумма мощностей выбранных приборов; можно оставить как ориентир
  return { daily_kwh: daily, peak_kw: peak_kw };
}

function annualFromDaily(daily_kwh) {
  return daily_kwh * 365;
}

// -----------------------------
// Подбор подходящего комплекта
// -----------------------------
function chooseBestKit(annualConsumptionKwh, availableAreaM2, pvout, peak_kw) {
  // 1. ОТБОР ПО ПИКОВОЙ МОЩНОСТИ
  // ищем первый комплект, мощность которого >= пики приборов
  let idealKit = KITS.find(k => k.power_kW >= peak_kw);

  // если даже 10 кВт меньше пика — берём 10 кВт (лучшего нет)
  if (!idealKit) idealKit = KITS[KITS.length - 1];

  // 2. ПРОВЕРКА ПО ПЛОЩАДИ
  // если идеальный не помещается, берём комплект на одну ступень ниже
  let finalKit = idealKit;
  if (idealKit.area_m2 > availableAreaM2) {
    const idx = KITS.indexOf(idealKit);
    if (idx > 0) {
      finalKit = KITS[idx - 1];   // спускаемся на ступень ниже
    }
  }

  // если все равно не помещается — берём самый маленький
  if (finalKit.area_m2 > availableAreaM2) {
    finalKit = KITS[0];
  }

  // 3. РАСЧЁТ ВЫРАБОТКИ
  const annualGen = finalKit.power_kW * pvout * SYSTEM_LOSS;

  return {
    kit: finalKit,
    annualGen,
    areaLimited: finalKit !== idealKit
  };
}

// -----------------------------
// Основная функция: собираем введённые данные и считаем
// -----------------------------
function runCalculationAndRender() {
  // выбранные приборы
  const selectedIds = APPLIANCES.filter(a => {
    const cb = document.getElementById(`app-${a.id}`);
    return cb && cb.checked;
  }).map(a => a.id);

  const { daily_kwh, peak_kw } = computeDailyConsumption(selectedIds);
  const annualConsumption = annualFromDaily(daily_kwh); // кВт·ч/год

  const area = Number(areaInput?.value || 0);
  const tariff = Number(tariffInput?.value || 0);

  // pvout — берём из выбранного региона, если нет — используем разумную заглушку
  let pvout = 1400; // запас (кВт·ч/кВтp/год) — если нет данных
  if (selectedRegionName && pvoutByRegion[selectedRegionName]) {
    pvout = pvoutByRegion[selectedRegionName];
  }

  const chosen = chooseBestKit(annualConsumption, area, pvout, peak_kw);
  const kit = chosen.kit;
  const annualGen = chosen.annualGen;
  const coveragePercent = annualConsumption > 0 ? Math.min(100, (annualGen / annualConsumption) * 100) : 0;
  const yearlySavings = annualGen * tariff;

  // Отобразим результаты
  if (!resultsContainer) return;

  const areaNote = chosen.areaLimited
    ? `<p style="color:#b33"><strong>Внимание:</strong> введённая площадь не позволяет установить рекомендованные комплекты — выбран максимально возможный комплект.</p>`
    : '';

  resultsContainer.innerHTML = `
    <h3>Результат подбора</h3>
    <p><strong>Суточное потребление выбранных приборов:</strong> ${daily_kwh.toFixed(2)} кВт·ч</p>
    <p><strong>Пиковая суммарная мощность (ориентир):</strong> ${peak_kw.toFixed(2)} кВт</p>
    <p><strong>Годовое потребление (оценка):</strong> ${Math.round(annualConsumption).toLocaleString('ru-RU')} кВт·ч/год</p>
    <hr>
    <p><strong>Рекомендованный комплект:</strong> ${kit.name} — мощность ${kit.power_kW} кВт, занимает ${kit.area_m2} м², стоимость ${kit.price_rub.toLocaleString('ru-RU')} ₽</p>
    <p><strong>Ожидаемая годовая выработка:</strong> ${Math.round(annualGen).toLocaleString('ru-RU')} кВт·ч/год</p>
    <p><strong>Покрытие потребления:</strong> ${coveragePercent.toFixed(0)}%</p>
    <p><strong>Ожидаемая годовая экономия:</strong> ${Math.round(yearlySavings).toLocaleString('ru-RU')} ₽/год (при тарифе ${tariff} ₽/кВт·ч)</p>
    ${areaNote}
    <hr>
    <p class="hint">PVOUT использован: ${pvout} кВт·ч/кВтp/год. Коэффициент системных потерь: ${Math.round((1-SYSTEM_LOSS)*100)}%.</p>
    <p style="margin-top:10px"><button id="recalcButton">Пересчитать</button></p>
  `;

  // привяжем кнопку пересчёта
  const recalcBtn = document.getElementById('recalcButton');
  if (recalcBtn) recalcBtn.addEventListener('click', runCalculationAndRender);
}

// -----------------------------
// Инициализация карты + загрузка регионов (если есть элемент #map)
// Поддерживает geojson со свойствами { name: "...", pvout: 1234 }
// -----------------------------
function initMapIfNeeded() {
  const mapDiv = document.getElementById('map');
  if (!mapDiv) {
    // карта не используется — ok
    return;
  }

  // проверяем, не инициализировано ли уже
  if (window._solarMapInitialized) return;
  window._solarMapInitialized = true;

  // Подключаем Leaflet-слой, если L доступен
  try {
    const map = L.map('map').setView([61, 100], 3);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Контроль координат (внизу слева)
    const coordsControl = L.control({ position: 'bottomleft' });
    coordsControl.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-control-coords');
      div.innerHTML = 'Координаты: —';
      return div;
    };
    coordsControl.addTo(map);

    map.on('mousemove', (e) => {
      const lat = e.latlng.lat.toFixed(4);
      const lng = e.latlng.lng.toFixed(4);
      document.querySelectorAll('.leaflet-control-coords').forEach(d => d.innerHTML = `📍 ${lng}, ${lat}`);
    });

    // Попытаемся загрузить geojson
    fetch('russia_regions.geojson')
      .then(r => {
        if (!r.ok) throw new Error('regions not found');
        return r.json();
      })
      .then(data => {
        L.geoJSON(data, {
          style: { color: '#0b3', weight: 1, fillColor: '#cfead0', fillOpacity: 0.7 },
          onEachFeature: (feature, layer) => {
            const name = feature.properties?.name || feature.properties?.NAME || 'Регион';
            const pvout = Number(feature.properties?.pvout || feature.properties?.PVOUT || 1400);
            pvoutByRegion[name] = pvout;

            layer.on('mouseover', () => layer.setStyle({ fillColor: '#ffd54f', fillOpacity: 0.9 }));
            layer.on('mouseout', () => layer.setStyle({ fillColor: selectedRegionName === name ? '#ffe082' : '#cfead0', fillOpacity: 0.7 }));
            layer.on('click', (e) => {
              selectedRegionName = name;
              if (regionHint) regionHint.textContent = `Выбран регион: ${name} (PVOUT ${pvout})`;
              // сбросим стиль всех: (приблизительно) — перекрашиваем слой целиком через reload
              // проще: выставим стиль для всех через setStyle при каждом рендере — но здесь изменим только данный слой
              layer.setStyle({ fillColor: '#ffe082', fillOpacity: 0.95 });
              runCalculationAndRender();
            });
          }
        }).addTo(map);
      })
      .catch(err => {
        console.warn('Не удалось загрузить russia_regions.geojson — региональные PVOUT будут недоступны.', err);
      });

  } catch (err) {
    console.warn('Leaflet не инициализирован или отсутствует — карта не будет работать.', err);
  }
}

// -----------------------------
// События: инит
// -----------------------------
document.addEventListener('DOMContentLoaded', () => {
  renderAppliancesList();
  initMapIfNeeded();

  // связываем inputs (если есть)
  if (areaInput) areaInput.addEventListener('input', runCalculationAndRender);
  if (tariffInput) tariffInput.addEventListener('input', runCalculationAndRender);

  // первичный расчёт
  runCalculationAndRender();
});
