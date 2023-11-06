onmessage = (e) => {
  const vertices = e.data as [number, number][];

  const filtration = new Map<
    number,
    { edges: [number, number][]; triangles: [number, number, number][] }
  >();

  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      const distance = Math.sqrt(
        Math.pow(vertices[i][0] - vertices[j][0], 2) +
          Math.pow(vertices[i][1] - vertices[j][1], 2)
      );

      let filtrationLevel = filtration.get(distance);
      if (filtrationLevel === undefined) {
        filtrationLevel = { edges: [], triangles: [] };
        filtration.set(distance, filtrationLevel);
      }
      filtrationLevel.edges.push([i, j]);
    }
  }

  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      for (let k = j + 1; k < vertices.length; k++) {
        const distance = Math.max(
          Math.sqrt(
            Math.pow(vertices[i][0] - vertices[j][0], 2) +
              Math.pow(vertices[i][1] - vertices[j][1], 2)
          ),
          Math.sqrt(
            Math.pow(vertices[j][0] - vertices[k][0], 2) +
              Math.pow(vertices[j][1] - vertices[k][1], 2)
          ),
          Math.sqrt(
            Math.pow(vertices[i][0] - vertices[k][0], 2) +
              Math.pow(vertices[i][1] - vertices[k][1], 2)
          )
        );

        let filtrationLevel = filtration.get(distance);
        if (filtrationLevel === undefined) {
          filtrationLevel = { edges: [], triangles: [] };
          filtration.set(distance, filtrationLevel);
        }
        filtrationLevel.triangles.push([i, j, k]);
      }
    }
  }

  // We consider the matrix with the columns representing edges and triangles,
  // and the rows representing the vertices and edges and faces.
  // (Since we want to calculate the first persistence diagram.)
  const columns: { filtrationLevel: number; entries: Set<number> }[] = [];
  const edgeToColumnIndex = new Map<string, number>();
  [...filtration.keys()]
    .sort((a, b) => a - b)
    .forEach((filtrationLevel) => {
      const filtrationSimplices = filtration.get(filtrationLevel)!;

      filtrationSimplices.edges.forEach((edge) => {
        const entries = new Set<number>();
        entries.add(edge[0]);
        entries.add(edge[1]);
        columns.push({
          filtrationLevel,
          entries,
        });
        edgeToColumnIndex.set(JSON.stringify(edge), columns.length - 1);
      });

      filtrationSimplices.triangles.forEach((triangle) => {
        const entries = new Set<number>();
        // Add vertices.length for the initial vertex rows.
        entries.add(
          vertices.length +
            edgeToColumnIndex.get(JSON.stringify([triangle[0], triangle[1]]))!
        );
        entries.add(
          vertices.length +
            edgeToColumnIndex.get(JSON.stringify([triangle[1], triangle[2]]))!
        );
        entries.add(
          vertices.length +
            edgeToColumnIndex.get(JSON.stringify([triangle[0], triangle[2]]))!
        );
        columns.push({
          filtrationLevel,
          entries,
        });
      });
    });

  const lastIndex = new Map<number, number>(); // Map from 'lastIndex' to column index.
  columns.forEach((column, columnIndex) => {
    for (;;) {
      let last = -1;
      column.entries.forEach((simplexIndex) => {
        if (last < simplexIndex) {
          last = simplexIndex;
        }
      });

      if (last === -1) {
        // Zero column
        break;
      }

      const prevColumnIndex = lastIndex.get(last);
      if (prevColumnIndex === undefined) {
        lastIndex.set(last, columnIndex);
        break;
      }

      const prevColumn = columns[prevColumnIndex];
      prevColumn.entries.forEach((simplexIndex) => {
        if (column.entries.has(simplexIndex)) {
          column.entries.delete(simplexIndex);
        } else {
          column.entries.add(simplexIndex);
        }
      });
    }
  });

  const birthsAndDeaths: [number, number][] = [];
  let maxBirth = 0.0;
  let maxPersistence = 0.0;
  lastIndex.forEach((columnIndex, last) => {
    if (last <= vertices.length) {
      return;
    }

    const birthColumn = columns[last - vertices.length];
    const deathColumn = columns[columnIndex];

    if (birthColumn.filtrationLevel !== deathColumn.filtrationLevel) {
      birthsAndDeaths.push([
        birthColumn.filtrationLevel,
        deathColumn.filtrationLevel,
      ]);
      maxBirth = Math.max(maxBirth, birthColumn.filtrationLevel);
      maxPersistence = Math.max(
        maxPersistence,
        deathColumn.filtrationLevel - birthColumn.filtrationLevel
      );
    }
  });

  const imageSize = 500;
  const gridSize = 50;
  const gridSquareSize = imageSize / gridSize;

  const persistenceImage = [];
  for (let i = 0; i < gridSize; i++) {
    const row = [];
    for (let j = 0; j < gridSize; j++) {
      const xMin = j * gridSquareSize;
      const yMin = (gridSize - 1 - i) * gridSquareSize;

      let integral = 0.0;
      const integralGridSize = 10;
      const integralGridSquareSize = gridSquareSize / integralGridSize;
      for (let k = 0; k < integralGridSize; k++) {
        for (let l = 0; l < integralGridSize; l++) {
          const center = [
            xMin + (k + 0.5) * integralGridSquareSize,
            yMin + (l + 0.5) * integralGridSquareSize,
          ];
          let functionValueAtCenter = 0.0;
          birthsAndDeaths.forEach(([birth, death]) => {
            const point = [birth, death - birth];
            const weight = point[1] / maxPersistence;
            functionValueAtCenter +=
              (weight *
                Math.exp(
                  -(
                    (point[0] - center[0]) * (point[0] - center[0]) +
                    (point[1] - center[1]) * (point[1] - center[1])
                  ) /
                    (2 * 10 * 10)
                )) /
              (2 * Math.PI * 10 * 10);
          });
          integral +=
            functionValueAtCenter *
            integralGridSquareSize *
            integralGridSquareSize;
        }
      }

      row.push(integral);
    }
    persistenceImage.push(row);
  }

  postMessage({
    filtration,
    birthsAndDeaths,
    persistenceImage,
  });
};
