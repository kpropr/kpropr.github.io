// =================== Конфигурация ===================
const KITS = [
  { id: 'kit-1',  name: '1 кВт',  power_kW: 1,  area_m2: 8,  price_rub: 114990 },
  { id: 'kit-5',  name: '5 кВт',  power_kW: 5,  area_m2: 35, price_rub: 344490 },
  { id: 'kit-10', name: '10 кВт', power_kW: 10, area_m2: 74, price_rub: 677490 }
];

const SYSTEM_LOSS = 0.8;

// приборы — id должен совпадать с чекбоксом, hours и power_kW — для расчёта
const APPLIANCES = [
  { id:'kettle', name:'Электрочайник', power_kW:2.0, hours:0.166 },
  { id:'microwave', name:'Микроволновка', power_kW:1.5, hours:0.166 },
  { id:'iron', name:'Утюг', power_kW:1.8, hours:0.333 },
  { id:'stove', name:'Электроплита', power_kW:4.5, hours:0.667 },
  { id:'fridge', name:'Холодильник', power_kW:0.2, hours:8 },
  { id:'ac', name:'Кондиционер', power_kW:1.0, hours:5 },
  { id:'washer', name:'Стиральная машина', power_kW:2.0, hours:1 },
  { id:'oven', name:'Духовка', power_kW:2.4, hours:1 },
  { id:'lighting', name:'Освещение (LED)', power_kW:0.1, hours:5 },
  { id:'pc', name:'Компьютер', power_kW:0.25, hours:4 }
];

// DOM
const $ = id => document.getElementById(id);
const panelArea = $('panelArea');
const areaValue = $('areaValue');
const peakPower = $('peakPower');
const peakValue = $('peakValue');
const regionSelect = $('regionSelect');
const appliancesContainer = $('appliances');
const resultText = $('resultText');
const resultImage = $('kitImage');
const calcResults = $('calc-results');
const areaCalc = $('areaCalc');
const regionHint = $('select-region-hint');
const mapDiv = $('map');

let citiesData = [];
let pvoutByCity = {};
let selectedCity = null;

// =================== Утилитарки ===================
function formatNum(n){ return Math.round(n).toLocaleString('ru-RU'); }
function floatToStr(v, dec=1){ return Number(v).toFixed(dec); }

// =================== Рендер приборов ===================
function renderAppliances(){
  appliancesContainer.innerHTML = '';
  APPLIANCES.forEach(a=>{
    const div = document.createElement('div');
    div.className = 'appliance-row';
    div.innerHTML = `<label><input type="checkbox" id="app-${a.id}"> <strong>${a.name}</strong> — ${(a.power_kW*a.hours).toFixed(2)} кВт·ч/день</label>`;
    appliancesContainer.appendChild(div);

    // событие сразу привязываем
    const cb = div.querySelector('input');
    cb.addEventListener('change', ()=> {
      syncPeakFromAppliances();
      runCalculationAndRender();
    });
  });
}

// =================== Синхронизация ползунка Peak от выбранных приборов
function computeSelectedAppliances(){
  const sel = APPLIANCES.filter(a=> {
    const el = document.getElementById(`app-${a.id}`);
    return el && el.checked;
  });
  // суточное потребление и суммарная "пиковая" мощность (сумма номиналов)
  let daily = 0, peak = 0;
  sel.forEach(s=>{ daily += s.power_kW * s.hours; peak += s.power_kW; });
  return { daily, peak };
}

function syncPeakFromAppliances(){
  const { daily, peak } = computeSelectedAppliances();
  // Мы хотим чтобы ползунок peak отражал выбранные приборы.
  // Если пользователь вручную поднял ползунок выше — не понижаем его автоматически,
  // но если текущее значение ниже суммы приборов — поднимем его.
  const cur = parseFloat(peakPower.value);
  if (peak > cur) {
    peakPower.value = floatToStr(peak,1);
  }
  // обновляем отображение
  peakValue.textContent = floatToStr(peakPower.value,1);
}

// =================== Подбор комплекта (приоритет peak)
// Если площадь меньше — выбираем на 1 ступень ниже
function pickKitByPeak(peakKw, availableArea){
  // цель — подобрать минимальный комплект, который даёт >= 80% от peak
  const required = peakKw * 0.8;

  // сначала выберем идеальный по мощности (минимальный, >= required)
  let ideal = KITS.find(k => k.power_kW >= required);
  if (!ideal) ideal = KITS[KITS.length-1];

  // если площадь задана (>0) и ideal не помещается — шаг вниз
  if (availableArea > 0 && ideal.area_m2 > availableArea) {
    const idx = KITS.indexOf(ideal);
    if (idx > 0) {
      return { kit: KITS[idx-1], areaLimited: true, ideal };
    } else {
      return { kit: KITS[0], areaLimited: true, ideal };
    }
  }

  return { kit: ideal, areaLimited: false, ideal };
}

// =================== Основной расчёт и вывод
function runCalculationAndRender(){
  const area = Number(panelArea.value) || 0;
  const peak = Number(peakPower.value) || 0;
  const tariff = selectedCity ? (selectedCity.tariff || 0) : 0;
  const pvout = selectedCity ? (selectedCity.pvout || 1400) : 1400;

  // compute from appliances too
  const { daily, peak: appliancesPeak } = computeSelectedAppliances();
  // дневное потребление (kWh)
  const daily_kwh = daily;
  const annual = daily_kwh * 365;

  // pick kit by peak, with area fallback
  const { kit, areaLimited, ideal } = pickKitByPeak(Math.max(peak, appliancesPeak), area);

  const annualGen = kit.power_kW * pvout * SYSTEM_LOSS; // кВт·ч/год
  const coverage = annual > 0 ? Math.min(100, (annualGen / annual) * 100) : 0;
  const savings = annualGen * tariff;

  // quick top result (hero)
  if (!area || !peak) {
    resultText.innerHTML = `<div class="placeholder">Введите площадь и мощность для расчёта</div>`;
    resultImage.src = `img/${kit.id}.jpg`;
  } else {
    resultText.innerHTML = `
      <div>
        <p class="muted">На основе введённых параметров вам подойдет</p>
        <p class="big">${kit.name} — ${kit.power_kW} кВт</p>
        <p>Ожидаемая годовая выработка: <strong>${formatNum(annualGen)} кВт·ч/год</strong></p>
        <p>Ожидаемая экономия: <strong>${formatNum(savings)} ₽/год</strong></p>
        ${areaLimited ? '<p style="color:#b33"><strong>Внимание:</strong> площадь не позволяет установить идеальный комплект ('+ideal.name+'). Установлен комплект на одну ступень ниже.</p>' : ''}
      </div>`;
    resultImage.src = `img/${kit.id}.jpg`;
  }

  // lower results
  calcResults.innerHTML = `
    <p><strong>Суточное потребление (из выбранных приборов):</strong> ${daily_kwh.toFixed(2)} кВт·ч</p>
    <p><strong>Пиковая мощность (ориентир):</strong> ${Math.max(peak, appliancesPeak).toFixed(2)} кВт</p>
    <p><strong>Годовое потребление:</strong> ${formatNum(annual)} кВт·ч/год</p>
    <hr>
    <p><strong>Рекомендованный комплект:</strong> ${kit.name} — ${kit.area_m2} м², ${kit.price_rub.toLocaleString('ru-RU')} ₽</p>
    <p><strong>Годовая выработка:</strong> ${formatNum(annualGen)} кВт·ч/год</p>
    <p><strong>Покрытие потребления:</strong> ${coverage.toFixed(0)}%</p>
    <p><strong>Экономия в год:</strong> ${formatNum(savings)} ₽</p>
  `;

  // useful area calc (примерно)
  areaCalc.textContent = `Из доступной площади ${area} м² под панели реально получится занять ~${Math.max(0, Math.floor(area*0.85))} м² (учёт проходов, стыков).`;

}

// =================== Загрузка городов (cities.json)
function loadCities(){
  fetch('cities.json')
    .then(r => r.json())
    .then(list => {
      citiesData = list;
      regionSelect.innerHTML = '';
      // добавим опцию Москва по умолчанию, если есть
      let defaultIndex = 0;
      list.forEach((c,i)=>{
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${c.city} (PVOUT ${c.pvout}, тариф ${c.tariff} ₽)`;
        regionSelect.appendChild(opt);
        if (c.city.toLowerCase().includes('москв')) defaultIndex = i;
      });
      regionSelect.selectedIndex = defaultIndex;
      selectedCity = list[defaultIndex];
      regionHint && (regionHint.textContent = `Выбран регион: ${selectedCity.city} (PVOUT ${selectedCity.pvout})`);
      runCalculationAndRender();
    })
    .catch(e=>{
      console.warn('cities.json не найден:', e);
      // fallback
      selectedCity = null;
    });
}

// =================== События и инициализация
document.addEventListener('DOMContentLoaded', ()=>{
  renderAppliances();
  loadCities();

  // sync displays
  areaValue.textContent = panelArea.value;
  peakValue.textContent = parseFloat(peakPower.value).toFixed(1);

  panelArea.addEventListener('input', ()=>{
    areaValue.textContent = panelArea.value;
    runCalculationAndRender();
  });

  peakPower.addEventListener('input', ()=>{
    peakValue.textContent = parseFloat(peakPower.value).toFixed(1);
    runCalculationAndRender();
  });

  regionSelect.addEventListener('change', ()=>{
    const idx = parseInt(regionSelect.value,10);
    selectedCity = citiesData[idx];
    regionHint && (regionHint.textContent = `Выбран регион: ${selectedCity.city} (PVOUT ${selectedCity.pvout})`);
    runCalculationAndRender();
  });

  // Optional: init leaflet map bounded to world so it doesn't fly away
  if (mapDiv) {
    const map = L.map('map', {
      minZoom:3, maxZoom:7, maxBounds:[[85,-180],[-85,180]], maxBoundsViscosity:1.0
    }).setView([61,100],3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  }
});
