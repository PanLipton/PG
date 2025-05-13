// Flowchart.js - Основна логіка для роботи з блок-схемами

class FlowchartEditor {
  constructor() {
    this.jsPlumbInstance = null;
    this.threads = []; // Масив даних потоків
    this.variables = []; // Спільні змінні
    this.currentThread = 1; // Поточний активний потік
    this.blockCounter = 1; // Лічильник для генерації унікальних ID блоків
    this.selectedBlock = null; // Поточний вибраний блок
    this.selectedConnection = null; // Поточне вибране з'єднання
    
    this.init();
  }
  
  init() {
    // Ініціалізація jsPlumb
    this.jsPlumbInstance = jsPlumb.getInstance({
      Endpoint: ["Dot", { radius: 2 }],
      Connector: ["Bezier", { curviness: 50 }],
      HoverPaintStyle: { stroke: "#1e8151", strokeWidth: 2 },
      ConnectionOverlays: [
        ["Arrow", { location: 1, width: 10, length: 10, id: "arrow" }]
      ],
      Container: "flowchartCanvas"
    });
    
    // Налаштування за замовчуванням для з'єднань
    this.jsPlumbInstance.registerConnectionType("basic", {
      anchor: "Continuous",
      connector: ["Bezier", { curviness: 50 }],
      paintStyle: { stroke: "#5c96bc", strokeWidth: 2 },
      hoverPaintStyle: { stroke: "#1e8151", strokeWidth: 3 }
    });
    
    // Реєстрація типу для виділеного з'єднання
    this.jsPlumbInstance.registerConnectionType("selected", {
      paintStyle: { stroke: "#FF0000", strokeWidth: 3 }
    });
    
    this.createThread(1);
    
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    // Робимо блоки рухомими
    this.jsPlumbInstance.draggable(document.querySelectorAll(".flowchart-block"), {
      grid: [10, 10],
      containment: "flowchartCanvas",
      start: () => {
        // Додаємо обробник початку перетягування
        this.isDragging = true;
      },
      stop: () => {
        // Додаємо обробник закінчення перетягування 
        this.isDragging = false;
        this.jsPlumbInstance.repaintEverything();
      }
    });
    
    // Обробник для перетягування елементів з палітри
    document.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        this.onPaletteItemDrag(e, item);
      });
    });
    
    // Додаємо обробник подій миші на канвас для відстеження зумування/скролінгу
    const canvas = document.getElementById('flowchartCanvas');
    canvas.addEventListener('wheel', () => {
      // Після скролінгу перерисовуємо з'єднання
      setTimeout(() => {
        this.jsPlumbInstance.repaintEverything();
      }, 50);
    });
    
    // Вибір блоку при натисканні
    document.addEventListener('click', (e) => {
      // Перевірка, чи натискання відбулося на блоці
      if (e.target.classList.contains('flowchart-block') || 
          e.target.closest('.flowchart-block')) {
        const block = e.target.classList.contains('flowchart-block') ? 
                      e.target : e.target.closest('.flowchart-block');
        this.selectBlock(block);
        // Знімаємо виділення з з'єднання при виборі блоку
        this.deselectConnection();
      } else if (e.target.id === 'flowchartCanvas' || e.target.closest('#flowchartCanvas')) {
        // Якщо натиснуто на полотно, але не на блок, зняти виділення
        this.deselectBlock();
        this.deselectConnection();
      }
      
      // Перевіряємо кліки по з'єднаннях (перевірку робимо через відсутню подію на самому з'єднанні)
      if (!this.isDragging && !e.target.classList.contains('endpoint') && 
          !e.target.closest('.flowchart-block')) {
        this.checkConnectionClick(e);
      }
    });
    
    // Обробник кнопки додавання потоку
    document.getElementById('addThread').addEventListener('click', () => {
      const newThreadId = this.threads.length + 1;
      this.createThread(newThreadId);
      this.switchThread(newThreadId);
      
      // Оновлення списку потоків в інтерфейсі
      const threadItem = document.createElement('a');
      threadItem.href = '#';
      threadItem.className = 'list-group-item list-group-item-action';
      threadItem.dataset.threadId = newThreadId;
      threadItem.textContent = `Потік ${newThreadId}`;
      threadItem.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchThread(newThreadId);
      });
      document.getElementById('threadsList').appendChild(threadItem);
    });
    
    // Обробник кнопки додавання змінної
    document.getElementById('addVariable').addEventListener('click', () => {
      const varName = document.getElementById('newVarName').value.trim();
      if (varName && !this.variables.includes(varName)) {
        this.variables.push(varName);
        this.updateVariablesList();
        document.getElementById('newVarName').value = '';
      }
    });
    
    // Обробники кліків на елементах списку потоків
    document.querySelectorAll('#threadsList .list-group-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const threadId = parseInt(item.dataset.threadId);
        this.switchThread(threadId);
      });
    });
    
    // Обробник видалення блоку або з'єднання (клавіша Delete)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Delete') {
        if (this.selectedBlock) {
          this.deleteBlock(this.selectedBlock);
        } else if (this.selectedConnection) {
          this.deleteConnection(this.selectedConnection);
        }
      }
    });
  }
  
  createThread(threadId) {
    // Ініціалізація нового потоку з початковим блоком
    const thread = {
      id: threadId,
      blocks: [],
      connections: []
    };
    
    this.threads.push(thread);
    
    // Додавання початкового блоку, якщо це новостворений потік
    if (document.getElementById('flowchartCanvas').childElementCount === 0) {
      this.addBlock('start', 'Початок', 100, 100);
    }
    
    return thread;
  }
  
  switchThread(threadId) {
    // Збереження стану поточного потоку
    this.saveCurrentThreadState();
    
    // Оновлення поточного потоку
    this.currentThread = threadId;
    
    // Оновлення інтерфейсу
    document.getElementById('currentThreadLabel').textContent = `Потік ${threadId}`;
    document.querySelectorAll('#threadsList .list-group-item').forEach(item => {
      if (parseInt(item.dataset.threadId) === threadId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    
    // Завантаження блоків і з'єднань для цього потоку
    this.loadThreadState(threadId);
  }
  
  saveCurrentThreadState() {
    // Знаходження поточного потоку в масиві
    const currentThreadIndex = this.threads.findIndex(t => t.id === this.currentThread);
    if (currentThreadIndex === -1) return;
    
    const blocks = [];
    const connections = [];
    
    // Збереження всіх блоків
    document.querySelectorAll('.flowchart-block').forEach(block => {
      blocks.push({
        id: block.id,
        type: block.dataset.blockType,
        text: block.dataset.text || block.textContent,
        left: parseInt(block.style.left),
        top: parseInt(block.style.top),
        properties: JSON.parse(block.dataset.properties || '{}')
      });
    });
    
    // Збереження всіх з'єднань
    this.jsPlumbInstance.getConnections().forEach(conn => {
      const connLabel = conn.getLabel();
      connections.push({
        source: conn.source.id,
        target: conn.target.id,
        sourceEndpoint: conn.endpoints[0].anchor.type,
        targetEndpoint: conn.endpoints[1].anchor.type,
        label: typeof connLabel === 'object' && connLabel ? connLabel.label : connLabel || ''
      });
    });
    
    this.threads[currentThreadIndex].blocks = blocks;
    this.threads[currentThreadIndex].connections = connections;
  }
  
  loadThreadState(threadId) {
    // Очищення полотна
    const canvas = document.getElementById('flowchartCanvas');
    canvas.innerHTML = '';
    this.jsPlumbInstance.reset();
    
    // Пошук даних потоку
    const thread = this.threads.find(t => t.id === threadId);
    if (!thread) return;
    
    console.log(`Loading thread ${threadId} with ${thread.blocks.length} blocks and ${thread.connections.length} connections`);
    
    // Створення всіх блоків
    if (thread.blocks && thread.blocks.length > 0) {
      thread.blocks.forEach(block => {
        this.addBlock(block.type, block.text, block.left, block.top, block.id, block.properties);
      });
      
      // Зробити блоки рухомими
      this.jsPlumbInstance.draggable(document.querySelectorAll(".flowchart-block"), {
        grid: [10, 10],
        containment: "flowchartCanvas"
      });
      
      // Створення всіх з'єднань
      if (thread.connections && thread.connections.length > 0) {
        // Невелика затримка щоб дати блокам час на ініціалізацію
        setTimeout(() => {
          thread.connections.forEach(conn => {
            const source = document.getElementById(conn.source);
            const target = document.getElementById(conn.target);
            
            if (source && target) {
              const connection = this.jsPlumbInstance.connect({
                source: source,
                target: target,
                type: "basic"
              });
              
              if (conn.label) {
                connection.setLabel({ label: conn.label, cssClass: "connection-label" });
              }
              
              // Додавання обробника кліку на з'єднання
              this.setupConnectionEvents(connection);
            } else {
              console.warn(`Connection not created: source=${conn.source}, target=${conn.target}`, source, target);
            }
          });
          
          // Перемалювати всі з'єднання для коректного відображення
          this.jsPlumbInstance.repaintEverything();
        }, 50);
      }
    } else {
      console.warn(`Thread ${threadId} has no blocks`);
    }
    
    // Скидаємо вибрані елементи
    this.selectedBlock = null;
    this.selectedConnection = null;
  }
  
  onPaletteItemDrag(event, item) {
    event.preventDefault();
    const blockType = item.dataset.blockType;
    const canvas = document.getElementById('flowchartCanvas');
    const rect = canvas.getBoundingClientRect();
    const text = this.getDefaultTextForBlockType(blockType);
    
    // Create a temporary element for drag visual feedback
    const ghostElement = document.createElement('div');
    ghostElement.className = `flowchart-block ${blockType}-block-shape`;
    ghostElement.style.opacity = '0.5';
    ghostElement.textContent = text;
    document.body.appendChild(ghostElement);
    
    // Set up the drag movement for visual feedback
    const moveHandler = (moveEvent) => {
      ghostElement.style.position = 'absolute';
      ghostElement.style.left = `${moveEvent.clientX - 60}px`;
      ghostElement.style.top = `${moveEvent.clientY - 20}px`;
      ghostElement.style.pointerEvents = 'none';
      ghostElement.style.zIndex = '1000';
    };
    
    // Set up drop handler
    const upHandler = (upEvent) => {
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
      document.body.removeChild(ghostElement);
      
      // Calculate position relative to canvas
      const canvasX = upEvent.clientX - rect.left;
      const canvasY = upEvent.clientY - rect.top;
      
      // Only add block if mouse is released over canvas
      if (upEvent.clientX >= rect.left && upEvent.clientX <= rect.right &&
          upEvent.clientY >= rect.top && upEvent.clientY <= rect.bottom) {
        this.addBlock(blockType, text, canvasX, canvasY);
      }
    };
    
    // Add the event listeners for drag and drop
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
    
    // Initial position for ghost element
    moveHandler(event);
  }
  
  addBlock(type, text, left, top, id = null, properties = {}) {
    const blockId = id || `block_${this.currentThread}_${this.blockCounter++}`;
    const block = document.createElement('div');
    block.id = blockId;
    
    // Відображення типу блоку на правильний CSS клас
    let blockClass = type;
    if (type === 'assignment') {
      blockClass = 'process';
    } else if (type === 'input' || type === 'output') {
      blockClass = 'io';
    }
    
    block.className = `flowchart-block ${blockClass}-block ${type}-block-shape`;
    block.dataset.blockType = type;
    block.dataset.properties = JSON.stringify(properties);
    block.dataset.text = text; // Зберігаємо оригінальний текст в data-атрибуті
    
    // Встановлення позиції з урахуванням меж канвасу
    const canvas = document.getElementById('flowchartCanvas');
    const maxLeft = canvas.clientWidth - 120;
    const maxTop = canvas.clientHeight - 80;
    
    // Обмеження координат в межах канвасу
    left = Math.max(0, Math.min(left, maxLeft));
    top = Math.max(0, Math.min(top, maxTop));
    
    block.style.left = `${left}px`;
    block.style.top = `${top}px`;
    
    // Встановлення вмісту відповідно до типу блоку
    if (type === 'decision') {
      block.innerHTML = `<span>${text}</span>`;
    } else {
      block.textContent = text;
    }
    
    document.getElementById('flowchartCanvas').appendChild(block);
    
    // Зробити блок рухомим
    this.jsPlumbInstance.draggable(block, {
      grid: [10, 10],
      containment: "flowchartCanvas",
      start: () => this.isDragging = true,
      stop: () => {
        this.isDragging = false;
        this.jsPlumbInstance.repaintEverything();
      }
    });
    
    // Додавання кінцевих точок відповідно до типу блоку
    setTimeout(() => {
      this.addEndpointsToBlock(block, type);
      this.jsPlumbInstance.repaintEverything();
    }, 0);
    
    return block;
  }
  
  addEndpointsToBlock(block, type) {
    // Різні блоки мають різні кінцеві точки
    switch (type) {
      case 'start':
        this.jsPlumbInstance.addEndpoint(block, {
          anchor: 'Bottom',
          isSource: true,
          isTarget: false,
          maxConnections: 1,
          cssClass: 'endpoint endpoint-bottom'
        });
        break;
        
      case 'end':
        this.jsPlumbInstance.addEndpoint(block, {
          anchor: 'Top',
          isSource: false,
          isTarget: true,
          maxConnections: -1,
          cssClass: 'endpoint endpoint-top'
        });
        break;
        
      case 'assignment':
      case 'input':
      case 'output':
        this.jsPlumbInstance.addEndpoint(block, {
          anchor: 'Top',
          isSource: false,
          isTarget: true,
          maxConnections: -1,
          cssClass: 'endpoint endpoint-top'
        });
        this.jsPlumbInstance.addEndpoint(block, {
          anchor: 'Bottom',
          isSource: true,
          isTarget: false,
          maxConnections: 1,
          cssClass: 'endpoint endpoint-bottom'
        });
        break;
        
      case 'decision':
        this.jsPlumbInstance.addEndpoint(block, {
          anchor: 'Top',
          isSource: false,
          isTarget: true,
          maxConnections: -1,
          cssClass: 'endpoint endpoint-top'
        });
        this.jsPlumbInstance.addEndpoint(block, {
          anchor: 'Right',
          isSource: true,
          isTarget: false,
          maxConnections: 1,
          cssClass: 'endpoint endpoint-yes',
          parameters: { label: 'Так' }
        });
        this.jsPlumbInstance.addEndpoint(block, {
          anchor: 'Bottom',
          isSource: true,
          isTarget: false,
          maxConnections: 1,
          cssClass: 'endpoint endpoint-no',
          parameters: { label: 'Ні' }
        });
        break;
    }
  }
  
  selectBlock(block) {
    // Зняття виділення з попереднього блоку
    if (this.selectedBlock) {
      this.selectedBlock.classList.remove('selected');
    }
    
    // Виділення нового блоку
    block.classList.add('selected');
    this.selectedBlock = block;
    
    // Оновлення панелі властивостей
    this.updatePropertyPanel(block);
  }
  
  deselectBlock() {
    if (this.selectedBlock) {
      this.selectedBlock.classList.remove('selected');
      this.selectedBlock = null;
      
      // Скидання панелі властивостей
      document.getElementById('propertiesContent').innerHTML = 
        '<p class="text-muted">Виберіть блок для перегляду/редагування властивостей</p>';
    }
  }
  
  updatePropertyPanel(block) {
    const type = block.dataset.blockType;
    const properties = JSON.parse(block.dataset.properties || '{}');
    
    let html = `<div class="property-editor">
                  <h6>Властивості ${this.getBlockTypeName(type)}</h6>`;
    
    // Різні властивості на основі типу блоку
    switch (type) {
      case 'start':
      case 'end':
        // Немає специфічних властивостей для блоків початку/кінця
        html += `<p>Немає редагованих властивостей для цього типу блоку.</p>`;
        break;
        
      case 'assignment':
        html += `<div class="mb-3">
                  <label>Змінна для присвоєння</label>
                  <select id="assignVariable" class="form-select form-select-sm">
                    ${this.variables.map(v => `<option value="${v}" ${properties.variable === v ? 'selected' : ''}>${v}</option>`).join('')}
                  </select>
                </div>
                <div class="mb-3">
                  <label>Тип присвоєння</label>
                  <select id="assignType" class="form-select form-select-sm">
                    <option value="constant" ${properties.type !== 'variable' ? 'selected' : ''}>Константа</option>
                    <option value="variable" ${properties.type === 'variable' ? 'selected' : ''}>Змінна</option>
                  </select>
                </div>
                <div id="valueContainer" class="mb-3" ${properties.type === 'variable' ? 'style="display:none"' : ''}>
                  <label>Значення</label>
                  <input type="number" id="assignValue" min="0" max="2147483647" value="${properties.value || 0}" class="form-control form-control-sm">
                </div>
                <div id="varContainer" class="mb-3" ${properties.type !== 'variable' ? 'style="display:none"' : ''}>
                  <label>Вихідна змінна</label>
                  <select id="assignSource" class="form-select form-select-sm">
                    ${this.variables.map(v => `<option value="${v}" ${properties.source === v ? 'selected' : ''}>${v}</option>`).join('')}
                  </select>
                </div>`;
        break;
        
      case 'input':
        html += `<div class="mb-3">
                  <label>Змінна введення</label>
                  <select id="inputVariable" class="form-select form-select-sm">
                    ${this.variables.map(v => `<option value="${v}" ${properties.variable === v ? 'selected' : ''}>${v}</option>`).join('')}
                  </select>
                </div>`;
        break;
        
      case 'output':
        html += `<div class="mb-3">
                  <label>Змінна виведення</label>
                  <select id="outputVariable" class="form-select form-select-sm">
                    ${this.variables.map(v => `<option value="${v}" ${properties.variable === v ? 'selected' : ''}>${v}</option>`).join('')}
                  </select>
                </div>`;
        break;
        
      case 'decision':
        html += `<div class="mb-3">
                  <label>Змінна для порівняння</label>
                  <select id="decisionVariable" class="form-select form-select-sm">
                    ${this.variables.map(v => `<option value="${v}" ${properties.variable === v ? 'selected' : ''}>${v}</option>`).join('')}
                  </select>
                </div>
                <div class="mb-3">
                  <label>Тип порівняння</label>
                  <select id="decisionComparison" class="form-select form-select-sm">
                    <option value="equal" ${properties.comparison === 'equal' ? 'selected' : ''}>==(дорівнює)</option>
                    <option value="less" ${properties.comparison === 'less' ? 'selected' : ''}>&lt;(менше)</option>
                  </select>
                </div>
                <div class="mb-3">
                  <label>Значення для порівняння</label>
                  <input type="number" id="decisionValue" min="0" max="2147483647" value="${properties.value || 0}" class="form-control form-control-sm">
                </div>`;
        break;
    }
    
    html += `<button id="updateBlockProperties" class="btn btn-primary btn-sm">Оновити</button>
             <button id="deleteBlock" class="btn btn-danger btn-sm ms-2">Видалити</button>
           </div>`;
    
    document.getElementById('propertiesContent').innerHTML = html;
    
    // Додавання обробників подій для полів властивостей
    this.setupPropertyEventHandlers(block);
  }
  
  setupPropertyEventHandlers(block) {
    const type = block.dataset.blockType;
    
    // Кнопка оновлення
    const updateBtn = document.getElementById('updateBlockProperties');
    if (updateBtn) {
      updateBtn.addEventListener('click', () => {
        this.updateBlockFromProperties(block);
      });
    }
    
    // Кнопка видалення
    const deleteBtn = document.getElementById('deleteBlock');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.deleteBlock(block);
      });
    }
    
    // Обробники для конкретних типів
    if (type === 'assignment') {
      const assignType = document.getElementById('assignType');
      if (assignType) {
        assignType.addEventListener('change', () => {
          const isVariable = assignType.value === 'variable';
          document.getElementById('valueContainer').style.display = isVariable ? 'none' : 'block';
          document.getElementById('varContainer').style.display = isVariable ? 'block' : 'none';
        });
      }
    }
  }
  
  updateBlockFromProperties(block) {
    const type = block.dataset.blockType;
    const properties = {};
    
    // Отримання властивостей на основі типу блоку
    switch (type) {
      case 'assignment':
        properties.variable = document.getElementById('assignVariable').value;
        properties.type = document.getElementById('assignType').value;
        if (properties.type === 'variable') {
          properties.source = document.getElementById('assignSource').value;
        } else {
          properties.value = parseInt(document.getElementById('assignValue').value);
        }
        
        // Оновлення тексту блоку
        if (properties.type === 'variable') {
          block.textContent = `${properties.variable} = ${properties.source}`;
        } else {
          block.textContent = `${properties.variable} = ${properties.value}`;
        }
        break;
        
      case 'input':
        properties.variable = document.getElementById('inputVariable').value;
        block.textContent = `ВВЕДЕННЯ ${properties.variable}`;
        break;
        
      case 'output':
        properties.variable = document.getElementById('outputVariable').value;
        block.textContent = `ДРУК ${properties.variable}`;
        break;
        
      case 'decision':
        properties.variable = document.getElementById('decisionVariable').value;
        properties.comparison = document.getElementById('decisionComparison').value;
        properties.value = parseInt(document.getElementById('decisionValue').value);
        
        // Оновлення тексту блоку
        const comparisonSymbol = properties.comparison === 'equal' ? '==' : '<';
        block.querySelector('span').textContent = `${properties.variable} ${comparisonSymbol} ${properties.value}`;
        break;
    }
    
    block.dataset.properties = JSON.stringify(properties);
  }
  
  deleteBlock(block) {
    // Видалення з'єднань
    this.jsPlumbInstance.remove(block);
    // Видалення з DOM
    block.remove();
    this.selectedBlock = null;
    
    // Забезпечення, що немає вибраного з'єднання
    this.selectedConnection = null;
    
    // Скидання панелі властивостей
    document.getElementById('propertiesContent').innerHTML = 
      '<p class="text-muted">Виберіть блок або з\'єднання для перегляду/редагування властивостей</p>';
  }
  
  getBlockTypeName(type) {
    const names = {
      'start': 'Початок',
      'end': 'Кінець',
      'assignment': 'Присвоєння',
      'input': 'Введення',
      'output': 'Виведення',
      'decision': 'Розгалуження'
    };
    return names[type] || type;
  }
  
  getDefaultTextForBlockType(type) {
    switch (type) {
      case 'start': return 'Початок';
      case 'end': return 'Кінець';
      case 'assignment': return 'var = 0';
      case 'input': return 'ВВЕДЕННЯ var';
      case 'output': return 'ДРУК var';
      case 'decision': return 'var == 0';
      default: return 'Блок';
    }
  }
  
  updateVariablesList() {
    const container = document.getElementById('variablesList');
    container.innerHTML = '';
    
    this.variables.forEach(variable => {
      const item = document.createElement('div');
      item.className = 'list-group-item';
      item.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
          <span>${variable}</span>
        </div>
      `;
      
      // Додавання кнопки видалення з таким же стилем, як і для потоків
      const deleteButton = document.createElement('span');
      deleteButton.className = 'thread-delete-icon';
      deleteButton.innerHTML = '&times;'; // × symbol
      deleteButton.style.color = 'red';
      deleteButton.style.opacity = '0.3';
      deleteButton.style.cursor = 'pointer';
      deleteButton.style.fontWeight = 'bold';
      deleteButton.style.fontSize = '1.2rem';
      deleteButton.style.padding = '0 5px';
      deleteButton.style.transition = 'opacity 0.2s';
      
      deleteButton.addEventListener('mouseenter', () => {
        deleteButton.style.opacity = '1';
      });
      
      deleteButton.addEventListener('mouseleave', () => {
        deleteButton.style.opacity = '0.3';
      });
      
      // Додавання обробника видалення
      deleteButton.addEventListener('click', () => {
        this.removeVariable(variable);
      });
      
      // Додавання кнопки до div контейнера
      item.querySelector('.d-flex').appendChild(deleteButton);
      
      container.appendChild(item);
    });
  }
  
  removeVariable(variable) {
    const index = this.variables.indexOf(variable);
    if (index !== -1) {
      this.variables.splice(index, 1);
      this.updateVariablesList();
    }
  }
  
  // Серіалізація даних блок-схеми в JSON
  serialize() {
    // Спочатку зберегти стан поточного потоку
    this.saveCurrentThreadState();
    
    return {
      threads: this.threads,
      variables: this.variables
    };
  }
  
  // Завантаження даних блок-схеми з JSON
  loadFromJson(data) {
    console.log("Loading flowchart from JSON:", data);
    
    // Повністю очистити поточний стан
    this.jsPlumbInstance.reset();
    document.getElementById('flowchartCanvas').innerHTML = '';
    
    // Завантажити нові дані
    this.variables = data.variables || [];
    this.threads = data.threads || [];
    
    // Оновлення інтерфейсу
    this.updateVariablesList();
    
    // Оновлення списку потоків
    const threadsList = document.getElementById('threadsList');
    threadsList.innerHTML = '';
    
    this.threads.forEach(thread => {
      const threadItem = document.createElement('a');
      threadItem.href = '#';
      threadItem.className = 'list-group-item list-group-item-action';
      if (thread.id === this.currentThread) {
        threadItem.classList.add('active');
      }
      threadItem.dataset.threadId = thread.id;
      threadItem.textContent = `Потік ${thread.id}`;
      threadItem.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchThread(thread.id);
      });
      threadsList.appendChild(threadItem);
    });
    
    // Зберігання поточного потоку
    const currentThreadId = this.currentThread;
    
    // Перевірка, чи існує поточний потік в нових даних
    const hasCurrentThread = this.threads.some(thread => thread.id === currentThreadId);
    
    // Завантаження потрібного потоку
    if (this.threads.length > 0) {
      if (hasCurrentThread) {
        // Якщо існує, оновити поточний потік
        console.log(`Loading current thread ${currentThreadId}`);
        // Не використовуємо switchThread щоб уникнути непотрібного збереження попереднього стану
        this.currentThread = currentThreadId;
        this.loadThreadState(currentThreadId);
        
        // Оновлення інтерфейсу поточного потоку
        document.getElementById('currentThreadLabel').textContent = `Потік ${currentThreadId}`;
        document.querySelectorAll('#threadsList .list-group-item').forEach(item => {
          if (parseInt(item.dataset.threadId) === currentThreadId) {
            item.classList.add('active');
          } else {
            item.classList.remove('active');
          }
        });
      } else {
        // Якщо не існує, перейти до першого потоку
        console.log(`Current thread ${currentThreadId} not found in loaded data, switching to thread ${this.threads[0].id}`);
        this.currentThread = this.threads[0].id;
        this.loadThreadState(this.threads[0].id);
        
        // Оновлення інтерфейсу
        document.getElementById('currentThreadLabel').textContent = `Потік ${this.threads[0].id}`;
        document.querySelectorAll('#threadsList .list-group-item').forEach(item => {
          if (parseInt(item.dataset.threadId) === this.threads[0].id) {
            item.classList.add('active');
          } else {
            item.classList.remove('active');
          }
        });
      }
    }
  }
  
  // Метод для перевірки кліків по з'єднаннях (оскільки немає прямого доступу до об'єкта з'єднання)
  checkConnectionClick(event) {
    // Отримуємо всі з'єднання
    const connections = this.jsPlumbInstance.getConnections();
    
    // Координати кліку
    const canvasRect = document.getElementById('flowchartCanvas').getBoundingClientRect();
    const clickX = event.clientX - canvasRect.left;
    const clickY = event.clientY - canvasRect.top;
    
    // Пороги для виявлення кліку на з'єднанні
    const hitThreshold = 10; // px
    
    // Перевіряємо кожне з'єднання
    for (let conn of connections) {
      // Перевіряємо, чи клік відбувся поблизу з'єднання
      if (this.isPointNearConnection(conn, clickX, clickY, hitThreshold)) {
        this.selectConnection(conn);
        return; // Припиняємо перевірку після знаходження першого з'єднання
      }
    }
    
    // Якщо не знайдено жодного з'єднання, знімаємо виділення
    this.deselectConnection();
  }
  
  // Допоміжний метод для перевірки, чи точка поблизу з'єднання
  isPointNearConnection(connection, x, y, threshold) {
    // Отримуємо сегменти з'єднання
    const connInfo = connection.connector;
    if (!connInfo) return false;
    
    // Отримуємо координати початку та кінця з'єднання
    const source = connection.source;
    const target = connection.target;
    if (!source || !target) return false;
    
    // Отримуємо розміри та позиції елементів
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const canvasRect = document.getElementById('flowchartCanvas').getBoundingClientRect();
    
    // Координати початку та кінця, відносно канвасу
    const sourceX = sourceRect.left + sourceRect.width/2 - canvasRect.left;
    const sourceY = sourceRect.top + sourceRect.height/2 - canvasRect.top;
    const targetX = targetRect.left + targetRect.width/2 - canvasRect.left;
    const targetY = targetRect.top + targetRect.height/2 - canvasRect.top;
    
    // Спрощена перевірка для кривих ліній - перевіряємо відстань до лінії від точки до точки
    // Використовуємо формулу для знаходження відстані від точки до лінії
    const lineLength = Math.sqrt((targetX - sourceX) ** 2 + (targetY - sourceY) ** 2);
    if (lineLength === 0) return false;
    
    const distance = Math.abs(
      (targetY - sourceY) * x - (targetX - sourceX) * y + targetX * sourceY - targetY * sourceX
    ) / lineLength;
    
    // Додаткова перевірка, чи точка знаходиться в прямокутнику між початком та кінцем
    // з деяким запасом для кривизни
    const minX = Math.min(sourceX, targetX) - threshold;
    const maxX = Math.max(sourceX, targetX) + threshold;
    const minY = Math.min(sourceY, targetY) - threshold;
    const maxY = Math.max(sourceY, targetY) + threshold;
    
    const inBounds = (x >= minX && x <= maxX && y >= minY && y <= maxY);
    
    return distance <= threshold && inBounds;
  }
  
  // Метод для налаштування подій для з'єднань
  setupConnectionEvents(connection) {
    // На жаль, jsPlumb не дозволяє напряму призначати addEventListener на з'єднання,
    // тому ми обробляємо це через checkConnectionClick
  }
  
  // Метод для виділення з'єднання
  selectConnection(connection) {
    // Знімаємо виділення з блоку
    this.deselectBlock();
    
    // Знімаємо виділення з попереднього з'єднання, якщо воно було
    this.deselectConnection();
    
    // Виділяємо поточне з'єднання
    this.selectedConnection = connection;
    connection.addType("selected");
    
    // Оновлюємо панель властивостей для з'єднання
    this.updateConnectionPropertyPanel(connection);
  }
  
  // Метод для зняття виділення з з'єднання
  deselectConnection() {
    if (this.selectedConnection) {
      this.selectedConnection.removeType("selected");
      this.selectedConnection = null;
      
      // Скидання панелі властивостей
      document.getElementById('propertiesContent').innerHTML = 
        '<p class="text-muted">Виберіть блок або з\'єднання для перегляду/редагування властивостей</p>';
    }
  }
  
  // Метод для видалення з'єднання
  deleteConnection(connection) {
    // Видаляємо з'єднання з jsPlumb
    this.jsPlumbInstance.deleteConnection(connection);
    this.selectedConnection = null;
    
    // Скидання панелі властивостей
    document.getElementById('propertiesContent').innerHTML = 
      '<p class="text-muted">Виберіть блок або з\'єднання для перегляду/редагування властивостей</p>';
  }
  
  // Метод для оновлення панелі властивостей для з'єднання
  updateConnectionPropertyPanel(connection) {
    const label = connection.getLabel() || '';
    
    let html = `<div class="property-editor">
                  <h6>Властивості з'єднання</h6>
                  <div class="mb-3">
                    <label>Мітка з'єднання</label>
                    <input type="text" id="connectionLabel" class="form-control form-control-sm" value="${label}" placeholder="Мітка">
                  </div>
                  <button id="updateConnection" class="btn btn-sm btn-primary mb-2">Оновити</button>
                  <button id="deleteConnection" class="btn btn-sm btn-danger">Видалити</button>
                </div>`;
    
    document.getElementById('propertiesContent').innerHTML = html;
    
    // Додаємо обробники подій для кнопок
    this.setupConnectionPropertyEventHandlers(connection);
  }
  
  // Метод для налаштування обробників подій для властивостей з'єднання
  setupConnectionPropertyEventHandlers(connection) {
    // Обробник для оновлення мітки з'єднання
    const updateBtn = document.getElementById('updateConnection');
    if (updateBtn) {
      updateBtn.addEventListener('click', () => {
        const label = document.getElementById('connectionLabel').value;
        if (label) {
          connection.setLabel({ label: label, cssClass: "connection-label" });
        } else {
          connection.setLabel(null);
        }
      });
    }
    
    // Обробник для видалення з'єднання
    const deleteBtn = document.getElementById('deleteConnection');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.deleteConnection(connection);
      });
    }
  }
}