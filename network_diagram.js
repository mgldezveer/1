// Алгоритм построения сетевого графика методом критического пути (CPM)
class NetworkDiagram {
  constructor(projectData) {
    this.projectData = projectData;
    this.tasks = [];
    this.dependencies = {};
    this.forwardPass = {};
    this.backwardPass = {};
    this.criticalPath = [];
    this.parseTasks();
  }

  // Парсинг задач из проектного файла
  parseTasks() {
    const phases = this.projectData.project_structure.phases;
    
    // Функция для обработки задач в фазе
    const processTasks = (tasks, phaseName) => {
      for (const task of tasks) {
        const taskId = `${phaseName}_${task.task_name}`;
        this.tasks.push({
          id: taskId,
          name: task.task_name,
          duration: task.duration,
          assigned_to: task.assigned_to,
          depends_on: task.depends_on,
          phase: phaseName
        });
      }
    };

    for (const phase of phases) {
      if (phase.tasks) {
        processTasks(phase.tasks, phase.phase_name);
      }
      
      // Обработка подфаз, если они существуют
      if (phase.subphases) {
        for (const subphase of phase.subphases) {
          if (subphase.tasks) {
            processTasks(subphase.tasks, `${phase.phase_name}_${subphase.subphase_name}`);
          }
        }
      }
    }
    
    // Создание маппинга зависимостей
    for (const task of this.tasks) {
      this.dependencies[task.id] = task.depends_on.map(dep => 
        this.tasks.find(t => t.name === dep)?.id
      ).filter(id => id !== undefined);
    }
 }

  // Метод прямого прохода (Early Start и Early Finish)
  forwardCalculation() {
    // Инициализация значений
    for (const task of this.tasks) {
      this.forwardPass[task.id] = { es: 0, ef: 0 };
    }

    // Топологическая сортировка для правильного порядка вычислений
    const sortedTasks = this.topologicalSort();

    for (const taskId of sortedTasks) {
      const task = this.tasks.find(t => t.id === taskId);
      const deps = this.dependencies[taskId];
      
      let es = 0;
      if (deps.length > 0) {
        es = Math.max(...deps.map(depId => this.forwardPass[depId].ef));
      }
      
      this.forwardPass[taskId].es = es;
      this.forwardPass[taskId].ef = es + task.duration;
    }
  }

  // Метод обратного прохода (Late Start и Late Finish)
  backwardCalculation() {
    // Инициализация значений
    for (const task of this.tasks) {
      this.backwardPass[task.id] = { ls: Infinity, lf: Infinity };
    }

    // Найдем максимальное значение EF для завершения проекта
    const projectFinishTime = Math.max(...Object.values(this.forwardPass).map(v => v.ef));
    
    // Найдем задачи, которые завершают проект
    const endTasks = this.tasks.filter(task => 
      this.forwardPass[task.id].ef === projectFinishTime
    );
    
    for (const task of endTasks) {
      this.backwardPass[task.id].lf = projectFinishTime;
      this.backwardPass[task.id].ls = projectFinishTime - task.duration;
    }

    // Обратная топологическая сортировка
    const sortedTasks = this.topologicalSort().reverse();

    for (const taskId of sortedTasks) {
      if (this.backwardPass[taskId].ls === Infinity) {
        // Если LF не был установлен, вычисляем на основе зависимых задач
        const dependents = this.tasks.filter(t => this.dependencies[t.id].includes(taskId));
        if (dependents.length > 0) {
          const minLS = Math.min(...dependents.map(dt => this.backwardPass[dt.id].ls));
          this.backwardPass[taskId].lf = minLS;
          this.backwardPass[taskId].ls = minLS - this.tasks.find(t => t.id === taskId).duration;
        }
      } else {
        // Обновляем LF на основе зависимых задач, если текущее значение больше
        const dependents = this.tasks.filter(t => this.dependencies[t.id].includes(taskId));
        if (dependents.length > 0) {
          const minLS = Math.min(...dependents.map(dt => this.backwardPass[dt.id].ls));
          if (minLS < this.backwardPass[taskId].lf) {
            this.backwardPass[taskId].lf = Math.min(this.backwardPass[taskId].lf, minLS);
            this.backwardPass[taskId].ls = this.backwardPass[taskId].lf - this.tasks.find(t => t.id === taskId).duration;
          }
        }
      }
    }
  }

  // Топологическая сортировка для правильного порядка вычислений
  topologicalSort() {
    const visited = new Set();
    const result = [];
    
    const dfs = (taskId) => {
      if (visited.has(taskId)) return;
      visited.add(taskId);
      
      for (const depId of this.dependencies[taskId]) {
        dfs(depId);
      }
      
      result.push(taskId);
    };
    
    for (const task of this.tasks) {
      if (!visited.has(task.id)) {
        dfs(task.id);
      }
    }
    
    return result;
 }

  // Вычисление полного и свободного резерва
 calculateReserves() {
    for (const task of this.tasks) {
      const fp = this.forwardPass[task.id];
      const bp = this.backwardPass[task.id];
      
      task.totalReserve = bp.lf - fp.ef;
      task.freeReserve = this.calculateFreeReserve(task.id);
    }
 }

  // Вычисление свободного резерва
 calculateFreeReserve(taskId) {
    const dependents = this.tasks.filter(t => this.dependencies[t.id].includes(taskId));
    
    if (dependents.length === 0) {
      // Если у задачи нет зависимых задач, свободный резерв равен общему резерву
      return this.tasks.find(t => t.id === taskId).totalReserve;
    }
    
    const minES = Math.min(...dependents.map(dt => this.forwardPass[dt.id].es));
    return minES - this.forwardPass[taskId].ef;
  }

 // Определение критического пути
  findCriticalPath() {
    this.criticalPath = this.tasks.filter(task => 
      task.totalReserve === 0
    );
  }

  // Выполнение полного анализа
  analyze() {
    this.forwardCalculation();
    this.backwardCalculation();
    this.calculateReserves();
    this.findCriticalPath();
  }

  // Генерация SVG диаграммы
 generateSVG() {
    this.analyze();
    
    // Размеры холста
    const width = 1200;
    const height = 800;
    const nodeWidth = 120;
    const nodeHeight = 80;
    
    // Создание SVG
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" style="font-family: Arial, sans-serif;">\n`;
    
    // Определение уровней для задач
    const levels = this.calculateLevels();
    
    // Рассчитываем позиции узлов
    const positions = {};
    let maxLevel = Math.max(...Object.keys(levels).map(Number));
    
    for (let level = 0; level <= maxLevel; level++) {
      const tasksAtLevel = levels[level] || [];
      const verticalSpacing = height / (tasksAtLevel.length + 1);
      
      for (let i = 0; i < tasksAtLevel.length; i++) {
        const taskId = tasksAtLevel[i];
        positions[taskId] = {
          x: 100 + level * 200,
          y: verticalSpacing * (i + 1)
        };
      }
    }
    
    // Рисуем связи между задачами
    for (const task of this.tasks) {
      const fromPos = positions[task.id];
      const toTasks = this.tasks.filter(t => this.dependencies[t.id].includes(task.id));
      
      for (const toTask of toTasks) {
        const toPos = positions[toTask.id];
        
        // Определяем цвет линии в зависимости от того, находится ли задача на критическом пути
        const isCritical = this.criticalPath.some(cp => cp.id === task.id) || 
                          this.criticalPath.some(cp => cp.id === toTask.id);
        const strokeColor = isCritical ? "red" : "black";
        const strokeWidth = isCritical ? "3" : "1";
        
        svg += `<line x1="${fromPos.x + nodeWidth}" y1="${fromPos.y + nodeHeight/2}" 
                   x2="${toPos.x}" y2="${toPos.y + nodeHeight/2}" 
                   stroke="${strokeColor}" stroke-width="${strokeWidth}" marker-end="url(#arrow)"/>\n`;
      }
    }
    
    // Добавляем стрелку для линий
    svg += `<defs>
      <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L9,3 z" fill="black" />
      </marker>
    </defs>\n`;
    
    // Рисуем узлы задач
    for (const task of this.tasks) {
      const pos = positions[task.id];
      const isCritical = this.criticalPath.some(cp => cp.id === task.id);
      const fillColor = isCritical ? "#ffcccc" : "#f0f0f0";
      
      svg += `<rect x="${pos.x}" y="${pos.y}" width="${nodeWidth}" height="${nodeHeight}" 
                 fill="${fillColor}" stroke="black" stroke-width="2"/>\n`;
      
      // Текст внутри узла
      const lines = this.wrapText(task.name, 15);
      for (let i = 0; i < lines.length; i++) {
        svg += `<text x="${pos.x + nodeWidth/2}" y="${pos.y + 15 + i*15}" 
                   font-size="10" text-anchor="middle">${lines[i]}</text>\n`;
      }
      
      // Дополнительная информация о задаче
      svg += `<text x="${pos.x + 5}" y="${pos.y + nodeHeight - 25}" 
                 font-size="8" fill="blue">ES:${this.forwardPass[task.id].es}</text>\n`;
      svg += `<text x="${pos.x + 5}" y="${pos.y + nodeHeight - 10}" 
                 font-size="8" fill="blue">EF:${this.forwardPass[task.id].ef}</text>\n`;
      svg += `<text x="${pos.x + nodeWidth - 25}" y="${pos.y + nodeHeight - 25}" 
                 font-size="8" fill="green">LS:${this.backwardPass[task.id].ls}</text>\n`;
      svg += `<text x="${pos.x + nodeWidth - 25}" y="${pos.y + nodeHeight - 10}" 
                 font-size="8" fill="green">LF:${this.backwardPass[task.id].lf}</text>\n`;
      svg += `<text x="${pos.x + nodeWidth/2}" y="${pos.y + nodeHeight + 12}" 
                 font-size="8" fill="purple" text-anchor="middle">TR:${task.totalReserve}</text>\n`;
    }
    
    // Добавляем легенду
    svg += `<rect x="20" y="20" width="150" height="100" fill="white" stroke="black"/>\n`;
    svg += `<text x="30" y="40" font-size="12" font-weight="bold">Легенда:</text>\n`;
    svg += `<rect x="30" y="50" width="15" height="10" fill="#ffcccc" stroke="black"/>\n`;
    svg += `<text x="50" y="60" font-size="10">Критический путь</text>\n`;
    svg += `<line x1="30" y1="70" x2="45" y2="70" stroke="red" stroke-width="3"/>\n`;
    svg += `<text x="50" y="73" font-size="10">Критическая связь</text>\n`;
    svg += `<text x="30" y="85" font-size="10" fill="blue">ES/EF - Ранние сроки</text>\n`;
    svg += `<text x="30" y="95" font-size="10" fill="green">LS/LF - Поздние сроки</text>\n`;
    svg += `<text x="30" y="105" font-size="10" fill="purple">TR - Общий резерв</text>\n`;
    
    svg += `</svg>`;
    
    return svg;
  }

  // Вспомогательная функция для разбиения текста
  wrapText(text, maxLength) {
    if (text.length <= maxLength) return [text];
    
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    for (const word of words) {
      if ((currentLine + word).length <= maxLength) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    
    if (currentLine) lines.push(currentLine);
    return lines;
 }

  // Вычисление уровней для визуализации
  calculateLevels() {
    const levels = {};
    const taskLevels = {};
    
    // Используем BFS для определения уровней
    const queue = [];
    
    // Находим начальные задачи (без зависимостей)
    for (const task of this.tasks) {
      if (this.dependencies[task.id].length === 0) {
        queue.push({taskId: task.id, level: 0});
        taskLevels[task.id] = 0;
      }
    }
    
    while (queue.length > 0) {
      const {taskId, level} = queue.shift();
      
      if (!levels[level]) levels[level] = [];
      if (!levels[level].includes(taskId)) levels[level].push(taskId);
      
      // Добавляем зависимые задачи на следующий уровень
      const dependents = this.tasks.filter(t => this.dependencies[t.id].includes(taskId));
      for (const dependent of dependents) {
        const newLevel = level + 1;
        if (!taskLevels[dependent.id] || taskLevels[dependent.id] < newLevel) {
          taskLevels[dependent.id] = newLevel;
          queue.push({taskId: dependent.id, level: newLevel});
        }
      }
    }
    
    return levels;
 }

  // Вывод отчета о критическом пути
  generateReport() {
    this.analyze();
    
    let report = "ОТЧЕТ О СЕТЕВОМ ГРАФИКЕ ПРОЕКТА\n";
    report += "================================\n\n";
    report += `Проект: ${this.projectData.project_name}\n`;
    report += `Руководитель проекта: ${this.projectData.project_manager}\n\n`;
    
    report += "КРИТИЧЕСКИЙ ПУТЬ:\n";
    report += "----------------\n";
    for (let i = 0; i < this.criticalPath.length; i++) {
      const task = this.criticalPath[i];
      report += `${i + 1}. ${task.name} (Фаза: ${task.phase}) - Длительность: ${task.duration} дней\n`;
    }
    
    report += "\nОБЩАЯ ДЛИТЕЛЬНОСТЬ ПРОЕКТА: ";
    const projectDuration = Math.max(...this.tasks.map(t => this.forwardPass[t.id].ef));
    report += `${projectDuration} дней\n\n`;
    
    report += "ВСЕ ЗАДАЧИ С ПАРАМЕТРАМИ:\n";
    report += "-------------------------\n";
    for (const task of this.tasks) {
      report += `Задача: ${task.name} (Фаза: ${task.phase})\n`;
      report += `  - Длительность: ${task.duration} дней\n`;
      report += `  - Ранний старт (ES): ${this.forwardPass[task.id].es}\n`;
      report += `  - Раннее окончание (EF): ${this.forwardPass[task.id].ef}\n`;
      report += `  - Поздний старт (LS): ${this.backwardPass[task.id].ls}\n`;
      report += `  - Позднее окончание (LF): ${this.backwardPass[task.id].lf}\n`;
      report += `  - Общий резерв: ${task.totalReserve} дней\n`;
      report += `  - Свободный резерв: ${task.freeReserve} дней\n`;
      report += `  - На критическом пути: ${this.criticalPath.some(cp => cp.id === task.id) ? "ДА" : "НЕТ"}\n`;
      report += `  - Исполнители: ${task.assigned_to.join(', ')}\n`;
      report += "\n";
    }
    
    return report;
 }
}

// Загрузка данных проекта из JSON
const projectData = {
  "project_name": "Разработка программного обеспечения",
  "project_manager": "Иванов И.Н.",
  "start_date": "15.09.22",
  "remarks": "Лабораторная работа No 1 Разработка структуры проекта",
  "project_structure": {
    "phases": [
      {
        "phase_name": "Анализ и требования к программному обеспечению",
        "start_date": "15.09.22",
        "end_date": "22.09.22",
        "tasks": [
          {
            "task_name": "Разработка функциональных спецификаций",
            "duration": 5,
            "assigned_to": ["Иванов И.Н. (менеджер)", "Петров П.П. (разработчик)"],
            "depends_on": []
          },
          {
            "task_name": "Разработка прототипа на основе функциональной спецификации",
            "duration": 4,
            "assigned_to": ["Сидоров С.С. (тестировщик)", "Жуков А.Б."],
            "depends_on": ["Разработка функциональных спецификаций"]
          },
          {
            "task_name": "Ревизия функциональных спецификаций",
            "duration": 2,
            "assigned_to": ["Козлов В.Г.", "Волков Д.Е."],
            "depends_on": ["Разработка функциональных спецификаций"]
          },
          {
            "task_name": "Доработка функциональных спецификаций с учетом замечаний",
            "duration": 0.5,
            "assigned_to": ["Медведев Ф.Ж.", "Кузнецов З.И."],
            "depends_on": ["Ревизия функциональных спецификаций"]
          },
          {
            "task_name": "Определение параметров модульной и уровневой архитектуры",
            "duration": 0.5,
            "assigned_to": ["Попов К.Л.", "Лебедев М.Н."],
            "depends_on": ["Разработка функциональных спецификаций", "Доработка функциональных спецификаций с учетом замечаний"]
          },
          {
            "task_name": "Назначение персонала для разработки",
            "duration": 1,
            "assigned_to": ["Иванов И.Н. (менеджер)", "Петров П.П. (разработчик)", "Сидоров С.С. (тестировщик)"],
            "depends_on": ["Определение параметров модульной и уровневой архитектуры"]
          }
        ]
      },
      {
        "phase_name": "Проектирование",
        "start_date": "23.09.22",
        "end_date": "06.11.22",
        "tasks": [
          {
            "task_name": "Разработка функциональных спецификаций",
            "duration": 5,
            "assigned_to": ["Иванов И.Н. (менеджер)", "Петров П.П. (разработчик)"],
            "depends_on": ["Разработка функциональных спецификаций"]
          },
          {
            "task_name": "Разработка прототипа на основе функциональной спецификации",
            "duration": 4,
            "assigned_to": ["Сидоров С.С. (тестировщик)", "Жуков А.Б."],
            "depends_on": ["Разработка функциональных спецификаций"]
          },
          {
            "task_name": "Ревизия функциональных спецификаций",
            "duration": 2,
            "assigned_to": ["Козлов В.Г.", "Волков Д.Е."],
            "depends_on": ["Разработка функциональных спецификаций"]
          },
          {
            "task_name": "Доработка функциональных спецификаций с учетом замечаний",
            "duration": 0.5,
            "assigned_to": ["Медведев Ф.Ж.", "Кузнецов З.И."],
            "depends_on": ["Ревизия функциональных спецификаций"]
          }
        ]
      },
      {
        "phase_name": "Разработка",
        "start_date": "07.1.22",
        "end_date": "15.12.22",
        "tasks": [
          {
            "task_name": "Определение параметров модульной и уровневой архитектуры",
            "duration": 0.5,
            "assigned_to": ["Попов К.Л.", "Лебедев М.Н."],
            "depends_on": ["Доработка функциональных спецификаций с учетом замечаний"]
          },
          {
            "task_name": "Назначение персонала для разработки",
            "duration": 1,
            "assigned_to": ["Иванов И.Н. (менеджер)", "Петров П.П. (разработчик)", "Сидоров С.С. (тестировщик)"],
            "depends_on": ["Определение параметров модульной и уровневой архитектуры"]
          },
          {
            "task_name": "Разработка кода",
            "duration": 15,
            "assigned_to": ["Петров П.П. (разработчик)", "Жуков А.Б.", "Козлов В.Г."],
            "depends_on": ["Назначение персонала для разработки"]
          }
        ]
      },
      {
        "phase_name": "Тестирование",
        "start_date": "16.12.22",
        "end_date": "23.12.2",
        "subphases": [
          {
            "subphase_name": "Тестирование модулей",
            "tasks": [
              {
                "task_name": "Тестирование модулей компонента в соответствии со спефикацией продукта",
                "duration": 2,
                "assigned_to": ["Сидоров С.С. (тестировщик)", "Волков Д.Е.", "Медведев Ф.Ж."],
                "depends_on": ["Разработка кода"]
              },
              {
                "task_name": "Выявление недостатков в спецификациях продукта",
                "duration": 3,
                "assigned_to": ["Кузнецов З.И.", "Попов К.Л.", "Лебедев М.Н."],
                "depends_on": ["Тестирование модулей компонента в соответствии со спефикацией продукта"]
              },
              {
                "task_name": "Изменение кода",
                "duration": 3,
                "assigned_to": ["Петров П.П. (разработчик)", "Жуков А.Б.", "Козлов В.Г."],
                "depends_on": ["Выявление недостатков в спецификациях продукта"]
              },
              {
                "task_name": "Повторное тестирование измененного кода",
                "duration": 2,
                "assigned_to": ["Сидоров С.С. (тестировщик)", "Волков Д.Е.", "Медведев Ф.Ж."],
                "depends_on": ["Изменение кода"]
              },
              {
                "task_name": "Тестирование модулей завершено",
                "duration": 0,
                "assigned_to": ["Сидоров С.С. (тестировщик)"],
                "depends_on": ["Повторное тестирование измененного кода"]
              }
            ]
          },
          {
            "subphase_name": "Тестирование интеграции",
            "tasks": [
              {
                "task_name": "Тестирование интеграции модулей",
                "duration": 5,
                "assigned_to": ["Сидоров С.С. (тестировщик)", "Кузнецов З.И.", "Попов К.Л."],
                "depends_on": ["Тестирование модулей завершено"]
              },
              {
                "task_name": "Выявление недостатков в спецификациях",
                "duration": 2,
                "assigned_to": ["Иванов И.Н. (менеджер)", "Лебедев М.Н.", "Жуков А.Б."],
                "depends_on": ["Тестирование интеграции модулей"]
              },
              {
                "task_name": "Изменение кода",
                "duration": 3,
                "assigned_to": ["Петров П.П. (разработчик)", "Козлов В.Г.", "Волков Д.Е."],
                "depends_on": ["Выявление недостатков в спецификациях"]
              },
              {
                "task_name": "Повторное тестирование измененного кода",
                "duration": 2,
                "assigned_to": ["Сидоров С.С. (тестировщик)", "Медведев Ф.Ж.", "Кузнецов З.И."],
                "depends_on": ["Изменение кода"]
              },
              {
                "task_name": "Тестирование интеграции завершено",
                "duration": 0,
                "assigned_to": ["Сидоров С.С. (тестировщик)"],
                "depends_on": ["Повторное тестирование измененного кода"]
              }
            ]
          }
        ]
      },
      {
        "phase_name": "Документация",
        "start_date": "24.12.22",
        "end_date": "31.12.22",
        "tasks": [
          {
            "task_name": "Разработка справки",
            "duration": 21,
            "assigned_to": ["Иванов И.Н. (менеджер)", "Петров П.П. (разработчик)", "Сидоров С.С. (тестировщик)"],
            "depends_on": ["Тестирование интеграции завершено"]
          },
          {
            "task_name": "Ревизия справки",
            "duration": 3,
            "assigned_to": ["Жуков А.Б.", "Козлов В.Г.", "Волков Д.Е."],
            "depends_on": ["Разработка справки"]
          },
          {
            "task_name": "Доработка справки с учетом замечаний",
            "duration": 2,
            "assigned_to": ["Медведев Ф.Ж.", "Кузнецов З.И.", "Попов К.Л."],
            "depends_on": ["Ревизия справки"]
          },
          {
            "task_name": "Разработка руководства пользователя",
            "duration": 21,
            "assigned_to": ["Лебедев М.Н.", "Иванов И.Н. (менеджер)", "Петров П.П. (разработчик)"],
            "depends_on": ["Разработка справки"]
          },
          {
            "task_name": "Ревизия всей документации для пользователей",
            "duration": 2,
            "assigned_to": ["Сидоров С.С. (тестировщик)", "Жуков А.Б.", "Козлов В.Г."],
            "depends_on": ["Разработка руководства пользователя", "Доработка справки с учетом замечаний"]
          },
          {
            "task_name": "Доработка документации для пользователей с учетом замечаний",
            "duration": 2,
            "assigned_to": ["Волков Д.Е.", "Медведев Ф.Ж.", "Кузнецов З.И."],
            "depends_on": ["Ревизия всей документации для пользователей"]
          }
        ]
      }
    ],
    "resources": {
      "team_members": [
        "Иванов И.Н. (менеджер)",
        "Петров П.П. (разработчик)",
        "Сидоров С.С. (тестировщик)",
        "Жуков А.Б.",
        "Козлов В.Г.",
        "Волков Д.Е.",
        "Медведев Ф.Ж.",
        "Кузнецов З.И.",
        "Попов К.Л.",
        "Лебедев М.Н."
      ],
      "tools": [
        "OpenProject",
        "Git",
        "Jira"
      ]
    },
    "milestones": [
      {
        "milestone": "Анализ завершен",
        "date": "22.09.22",
        "duration": 0
      },
      {
        "milestone": "Проектирование завершено",
        "date": "06.1.22",
        "duration": 0
      },
      {
        "milestone": "Разработка завершена",
        "date": "15.12.22",
        "duration": 0
      },
      {
        "milestone": "Тестирование завершено",
        "date": "23.12.22",
        "duration": 0
      },
      {
        "milestone": "Документация завершена",
        "date": "31.12.22",
        "duration": 0
      },
      {
        "milestone": "Разработка программного обеспечения завершена",
        "date": "31.12.22",
        "duration": 0
      }
    ]
 }
};

    
    // Создание сетевого графика
    const diagram = new NetworkDiagram(projectData);
    
    // Генерация SVG диаграммы
    const svgDiagram = diagram.generateSVG();
    
    // Генерация отчета
    const report = diagram.generateReport();
    
    // Сохранение диаграммы в файл
    const fs = require('fs');
    fs.writeFileSync('network_diagram.svg', svgDiagram);
    fs.writeFileSync('network_analysis_report.txt', report);
    
    console.log("Сетевой график проекта построен!");
    console.log("Файл диаграммы: network_diagram.svg");
    console.log("Файл отчета: network_analysis_report.txt");
    console.log("\nКритический путь:");
    diagram.criticalPath.forEach((task, index) => {
      console.log(`${index + 1}. ${task.name} (Фаза: ${task.phase})`);
    });
    
    console.log(`\nОбщая длительность проекта: ${Math.max(...diagram.tasks.map(t => diagram.forwardPass[t.id].ef))} дней`);