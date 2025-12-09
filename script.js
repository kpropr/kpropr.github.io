import emailjs from 'https://cdn.emailjs.com/sdk/v4/email.min.js';

// =================== Конфигурация ===================
const KITS = [
  { id: 'kit-1',  name: 'Комплект 1 кВт',  power_kW: 1,  area_m2: 8,  price_rub: 114990 },
  { id: 'kit-5',  name: 'Комплект 5 кВт',  power_kW: 5,  area_m2: 35, price_rub: 344490 },
  { id: 'kit-10', name: 'Комплект 10 кВт', power_kW: 10, area_m2: 74, price_rub: 677490 }
];

const SYSTEM_LOSS = 0.8;

const APPLIANCES = [
  { id:'kettle', name:'Электрочайник', power_kW:2.0 },
  { id:'microwave', name:'Микроволновка', power_kW:1.5 },
  { id:'iron', name:'Утюг', power_kW:1.8 },
  { id:'stove', name:'Электроплита', power_kW:4.5 },
  { id:'fridge', name:'Холодильник', power_kW:0.2 },
  { id:'ac', name:'Кондиционер', power_kW:1.0 },
  { id:'washer', name:'Стиральная машина', power_kW:2.0 },
  { id:'oven', name:'Духовка', power_kW:2.4 },
  { id:'lighting', name:'Освещение (LED)', power_kW:0.1 },
  { id:'pc', name:'Компьютер', power_kW:0.25 }
];

// =================== DOM и Состояние ===================
const $ = id => document.getElementById(id);
const panelAreaIn = $('panelArea');
const panelAreaTxt = $('panelAreaVal');
const peakPowerIn = $('peakPower');
const peakPowerTxt = $('peakVal');
const regionSelect = $('regionSelect');
const resultsSection = $('resultsSection');
const selectedTagsContainer = $('selectedTags');
const appliancesBtn = $('appliancesBtn');
const appliancesList = $('appliancesList');

let citiesData = [];
let selectedCity = null;
let selectedApplianceIds = []; 
let userType = "Не указано"; 

// =================== Утилиты ===================
function formatNum(n){ return Math.round(n).toLocaleString('ru-RU'); }

function updateSliderFill(slider, textElement) {
    const val = parseFloat(slider.value);
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const percent = ((val - min) / (max - min)) * 100;
    slider.style.setProperty('--percent', percent + '%');
    if(textElement) {
        textElement.style.left = `calc(${percent}% + (${14 - percent * 0.28}px))`;
        textElement.textContent = val; 
    }
}

// =================== Загрузка Городов ===================
function loadCities(){
  fetch('cities.json')
    .then(r => r.json())
    .then(list => {
      citiesData = list;
      regionSelect.innerHTML = '';
      let defaultIndex = 0;
      list.forEach((c,i)=>{
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = c.city; 
        regionSelect.appendChild(opt);
        if (c.city.toLowerCase().includes('москв')) defaultIndex = i;
      });
      regionSelect.selectedIndex = defaultIndex;
      selectedCity = list[defaultIndex];
      if (panelAreaIn.value > 0 || peakPowerIn.value > 0) {
        runCalculationAndRender();
      }
    })
    .catch(e => console.warn('cities.json не найден', e));
}

// =================== Логика Multiselect ===================
function renderDropdown() {
    appliancesList.innerHTML = '';
    APPLIANCES.forEach(app => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';        
        if (selectedApplianceIds.includes(app.id)) {
            item.classList.add('selected');
        }
        item.textContent = `${app.name}`;
        item.onclick = (e) => {
            e.stopPropagation(); 
            toggleAppliance(app.id);
        };
        appliancesList.appendChild(item);
    });
}

function renderTags() {
    selectedTagsContainer.innerHTML = '';
    selectedApplianceIds.forEach(id => {
        const app = APPLIANCES.find(a => a.id === id);
        if (!app) return;

        const tag = document.createElement('div');
        tag.className = 'tag-pill';
        tag.innerHTML = `
            ${app.name} 
            <div class="tag-close" onclick="removeAppliance('${id}')">✕</div>
        `;
        selectedTagsContainer.appendChild(tag);
    });
}

function toggleAppliance(id) {
    if (selectedApplianceIds.includes(id)) {
        selectedApplianceIds = selectedApplianceIds.filter(item => item !== id);
    } else {
        selectedApplianceIds.push(id);
    }
    updateUIFromAppliances();
}

function removeAppliance(id) {
    selectedApplianceIds = selectedApplianceIds.filter(item => item !== id);
    updateUIFromAppliances();
}

function updateUIFromAppliances() {
    renderTags();
    renderDropdown(); 
    syncPeakFromAppliances(); 
    runCalculationAndRender(); 
}

function resetAppliances() {
    if (selectedApplianceIds.length > 0) {
        selectedApplianceIds = [];
        renderTags();
        renderDropdown();
    }
}

appliancesBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    renderDropdown();
    appliancesList.classList.toggle('show');
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.multiselect-container')) {
        appliancesList.classList.remove('show');
    }
});

// =================== Синхронизация Мощности ===================
function syncPeakFromAppliances(){
  if(selectedApplianceIds.length === 0) return; 

  let peakSum = 0;
  selectedApplianceIds.forEach(id => {
      const app = APPLIANCES.find(a => a.id === id);
      if(app) peakSum += app.power_kW;
  });

  peakPowerIn.value = peakSum.toFixed(1);
  updateSliderFill(peakPowerIn, peakPowerTxt);
}

// =================== АВТОМАТИЧЕСКАЯ ОТПРАВКА ЗАЯВКИ ===================
function sendRequest(kitName, price, area, power) {
    const regionText = regionSelect.options[regionSelect.selectedIndex].text;
    const templateParams = {
        user_type: userType, 
        kit_name: kitName,   
        price: price,        
        area: area,          
        power: power,        
        region: regionText,  
    };
    emailjs.send('service_h7p8kf9', 'template_ha9iwvu', templateParams) 
        .then(function(response) {
            console.log('SUCCESS!', response.status, response.text);
            alert(' Ваша заявка отправлена! Мы скоро свяжемся с вами.'); 
        }, function(error) {
            console.log('FAILED...', error);
            alert(' Ошибка при отправке. Пожалуйста, попробуйте позже.'); 
        });
}

// =================== Основной Расчет ===================
function runCalculationAndRender(){
  const area = Number(panelAreaIn.value);
  const peak = Number(peakPowerIn.value);
  
  updateSliderFill(panelAreaIn, panelAreaTxt);
  updateSliderFill(peakPowerIn, peakPowerTxt);

  if (area === 0 || peak === 0) {
    resultsSection.innerHTML = `
        <div class="placeholder-box">
            <div class="placeholder-text">
                Укажите площадь вашего объекта и пиковую мощность,<br>
                и мы подберём для вас оптимальный готовый комплект
            </div>
        </div>`;
    return; 
  }

  const tariff = selectedCity ? (selectedCity.tariff || 5) : 5;
  const pvout = selectedCity ? (selectedCity.pvout || 1100) : 1100;

  const requiredPower = peak * 0.8;
  let idealKit = KITS.find(k => k.power_kW >= requiredPower);
  if (!idealKit) idealKit = KITS[KITS.length - 1];

  let finalKit = idealKit;
  let isDowngraded = false;

  if (area < idealKit.area_m2) {
     const possibleKits = [...KITS].reverse().filter(k => k.area_m2 <= area);
     if (possibleKits.length > 0) {
         finalKit = possibleKits[0];
         isDowngraded = true;
     } else {
         resultsSection.innerHTML = `
            <div class="error-message">
                К сожалению, под указанную площадь (${area} м²) невозможно установить ни один стандартный комплект.<br>
                Минимально необходимая площадь: ${KITS[0].area_m2} м².
            </div>
         `;
         return;
     }
  }
  const annualGen = finalKit.power_kW * pvout * SYSTEM_LOSS; 
  const savings = annualGen * tariff;
  
  let warningHTML = '';
  if (isDowngraded) {
      warningHTML = `<p style="color:#d9534f; font-size:16px;">
        <em>⚠️ Площадь не позволяет установить комплект ${idealKit.power_kW} кВт. 
        Подобран вариант меньше.</em>
      </p>`;
  }

  // --- ВЫВОД РЕЗУЛЬТАТА  ---
  resultsSection.innerHTML = `
    <div class="result-panel">
        <div class="result-info">
            <h2>${finalKit.name}</h2>
            <p>Площадь панелей: <strong>${finalKit.area_m2} м²</strong></p>
            <p>Выработка: <strong>${formatNum(annualGen)} кВт·ч/год</strong></p>
            <p>Экономия: <strong>${formatNum(savings)} ₽/год</strong></p>
            ${warningHTML}
            <div class="price">${formatNum(finalKit.price_rub)} ₽</div>
            
            <button class="order-btn" onclick="sendRequest('${finalKit.name}', '${formatNum(finalKit.price_rub)}', '${area}', '${peak}')">
                Оставить заявку
            </button>

        </div>
        <div class="result-image-block">
            <img src="img/${finalKit.id}.jpg" alt="${finalKit.name}" onerror="this.src='https://via.placeholder.com/800x600?text=SUNCALC+KIT'">
        </div>
    </div>
  `;
}

// =================== Инициализация ===================
document.addEventListener('DOMContentLoaded', ()=>{
    emailjs.init("WG50t7OIdHKqLSsWW"); 
    console.log("EmailJS инициализирован.");
    loadCities();
    updateSliderFill(panelAreaIn, panelAreaTxt);
    updateSliderFill(peakPowerIn, peakPowerTxt);
    
    panelAreaIn.addEventListener('input', ()=>{
        runCalculationAndRender(); 
    });

    peakPowerIn.addEventListener('input', (e)=>{
        if (e.isTrusted) {
           resetAppliances();
        }
        runCalculationAndRender();
    });
    regionSelect.addEventListener('change', ()=>{
        const idx = parseInt(regionSelect.value, 10);
        selectedCity = citiesData[idx];
        if(panelAreaIn.value > 0 || peakPowerIn.value > 0) runCalculationAndRender();
    });

    const modal = document.getElementById("userTypeModal");
    const modalBtns = document.querySelectorAll(".modal-btn");
    
    modalBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            userType = e.target.textContent; 
            modal.style.display = "none";
        });
    });
});
