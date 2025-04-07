document.addEventListener("DOMContentLoaded", function() {
  const canvas = document.getElementById("maze");
  const ctx = canvas.getContext("2d");
  const cellSize = 50;

  let width = parseInt(document.getElementById("inputWidth").value);
  let height = parseInt(document.getElementById("inputHeight").value);
  const STEP_DELAY = 150;
  let walls = [];
  let timeoutId = null;
  let isProcessing = false;

  function updateDimensions() {
    width = parseInt(document.getElementById("inputWidth").value);
    height = parseInt(document.getElementById("inputHeight").value);
    if (width > 30) width = 30;
    if (height > 20) height = 20;
    document.getElementById("inputWidth").value = width;
    document.getElementById("inputHeight").value = height;
    canvas.width = width * cellSize;
    canvas.height = height * cellSize;
  }

  function randomWalls() {
    walls = [];
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        if ((x === 0 && y === 0) || (x === width - 1 && y === height - 1)) continue;
        if (Math.random() < 0.4) walls.push([x, y]);
      }
    }
  }

  function drawMaze() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        ctx.strokeStyle = "#ccc";
        ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
    ctx.fillStyle = "black";
    for (const [x, y] of walls) {
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
    ctx.fillStyle = "blue";
    ctx.fillRect(0, 0, cellSize, cellSize);
    ctx.fillStyle = "red";
    ctx.fillRect((width - 1) * cellSize, (height - 1) * cellSize, cellSize, cellSize);
  }

  function hasPath() {
    const start = [0, 0];
    const end = [width - 1, height - 1];
    const visited = new Set();
    const queue = [start];
    visited.add(`${start[0]},${start[1]}`);
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    
    while (queue.length > 0) {
      const [x, y] = queue.shift();
      if (x === end[0] && y === end[1]) return true;
      
      for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height &&
            !visited.has(`${nx},${ny}`) &&
            !walls.some(([wx, wy]) => wx === nx && wy === ny)) {
          visited.add(`${nx},${ny}`);
          queue.push([nx, ny]);
        }
      }
      
      if (visited.size > width * height * 2) return false;
    }
    return false;
  }

  function animatePath(path, color) {
    if (timeoutId) clearTimeout(timeoutId);
    let i = 0;
    
    function step() {
      if (i >= path.length) {
        isProcessing = false;
        return;
      }
      const [x, y] = path[i];
      ctx.fillStyle = color;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      ctx.strokeStyle = "#ccc";
      ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
      i++;
      timeoutId = setTimeout(step, STEP_DELAY);
    }
    step();
  }

  function parsePath(formatted) {
    try {
      formatted = formatted.replace(/^Path\s*=\s*/, '').trim();
      formatted = formatted.replace(/\.$/, '');
      
      if (formatted.startsWith('[') && formatted.endsWith(']')) {
        return JSON.parse(formatted);
      }
      
      formatted = formatted.replace(/^\[/, '').replace(/\]$/, '');
      let parts = formatted.split(/\],\s*\[/);
      return parts.map(function(part) {
        part = part.replace(/[\[\]]/g, '');
        let coords = part.split(/\s*,\s*/).map(Number);
        return coords;
      });
    } catch (e) {
      console.error("Помилка парсингу шляху:", e);
      return [];
    }
  }

  async function runProlog() {
    if (isProcessing) return;
    isProcessing = true;
    
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    
    updateDimensions();
    
    let attempts = 0;
    do {
      randomWalls();
      attempts++;
      if (attempts > 100) {
        alert("Не вдалося згенерувати прохідний лабіринт. Спробуйте ще раз.");
        isProcessing = false;
        return;
      }
    } while (!hasPath());
    
    drawMaze();

    const maxDepth = width * height;
    
    const prologCode = `
      :- use_module(library(lists)).
      size(${width}, ${height}).
      
      ${walls.map(([x, y]) => `wall(${x}, ${y}).`).join("\n")}
      
      valid(X, Y) :-
          size(W, H),
          X >= 0, X < W,
          Y >= 0, Y < H,
          \\+ wall(X, Y).
      
      move(X, Y, X1, Y) :- X1 is X + 1, valid(X1, Y).
      move(X, Y, X1, Y) :- X1 is X - 1, valid(X1, Y).
      move(X, Y, X, Y1) :- Y1 is Y + 1, valid(X, Y1).
      move(X, Y, X, Y1) :- Y1 is Y - 1, valid(X, Y1).
      
      dfs(X, Y, X, Y, _, [[X, Y]]).
      dfs(X, Y, TX, TY, Visited, [[X, Y] | Path]) :-
          move(X, Y, NX, NY),
          \\+ member([NX, NY], Visited),
          length(Visited, L),
          L < ${maxDepth},
          dfs(NX, NY, TX, TY, [[NX, NY] | Visited], Path).
      
      find_path(Path) :-
          StartX = 0, StartY = 0,
          TargetX = ${width - 1}, TargetY = ${height - 1},
          dfs(StartX, StartY, TargetX, TargetY, [[StartX, StartY]], Path).
    `;

    try {
      const session = pl.create();
      session.consult(prologCode, {
        success: function() {
          session.query('find_path(Path).', {
            success: function() {
              session.answer({
                success: function(answer) {
                  if (pl.type.is_substitution(answer)) {
                    const formatted = session.format_answer(answer);
                    console.log("Formatted answer:", formatted);
                    const path = parsePath(formatted);
                    console.log("Parsed path:", path);
                    if (path.length > 0) {
                      animatePath(path, "rgba(255, 165, 0, 0.7)");
                    } else {
                      alert("Шлях не знайдено!");
                    }
                  } else {
                    alert("Шлях не знайдено!");
                  }
                  isProcessing = false;
                },
                error: function(err) {
                  console.error("Answer error:", err);
                  alert("Помилка при пошуку шляху!");
                  isProcessing = false;
                },
                limit: function() {
                  console.log("Досягнуто ліміт відповідей");
                  isProcessing = false;
                }
              });
            },
            error: function(err) {
              console.error("Query error:", err);
              alert("Помилка запиту!");
              isProcessing = false;
            }
          });
        },
        error: function(err) {
          console.error("Consult error:", err);
          alert("Помилка завантаження програми Prolog!");
          isProcessing = false;
        }
      });
    } catch (e) {
      console.error("Помилка виконання Prolog:", e);
      alert("Сталася помилка при виконанні!");
      isProcessing = false;
    }
  }

  document.getElementById("startBtn").addEventListener("click", runProlog);

  window.addEventListener('load', () => {
    updateDimensions();
    randomWalls();
    drawMaze();
  });
});