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
  const columns: {
    filtrationLevel: number;
    boundary: Set<number>;
    simplices: Set<number>;
  }[] = [];
  const edgeToColumnIndex = new Map<string, number>();
  const simplices: ([number, number]|[number, number, number])[] = [];
  [...filtration.keys()]
    .sort((a, b) => a - b)
    .forEach((filtrationLevel) => {
      const filtrationSimplices = filtration.get(filtrationLevel)!;

      filtrationSimplices.edges.forEach((edge) => {
        edgeToColumnIndex.set(JSON.stringify(edge), columns.length);
        simplices.push(edge);
        columns.push({
          filtrationLevel,
          boundary: new Set(edge),
          simplices: new Set([columns.length]),
        });
      });

      filtrationSimplices.triangles.forEach((triangle) => {
        simplices.push(triangle);
        // Add vertices.length for the initial vertex rows.
        columns.push({
          filtrationLevel,
          boundary: new Set([
            vertices.length +
              edgeToColumnIndex.get(
                JSON.stringify([triangle[0], triangle[1]])
              )!,
            vertices.length +
              edgeToColumnIndex.get(
                JSON.stringify([triangle[1], triangle[2]])
              )!,
            vertices.length +
              edgeToColumnIndex.get(
                JSON.stringify([triangle[0], triangle[2]])
              )!,
          ]),
          simplices: new Set([columns.length]),
        });
      });
    });

  const lastIndex = new Map<number, number>(); // Map from 'lastIndex' to column index.
  columns.forEach((column, columnIndex) => {
    for (;;) {
      let last = -1;
      column.boundary.forEach((simplexIndex) => {
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
      prevColumn.boundary.forEach((simplexIndex) => {
        if (column.boundary.has(simplexIndex)) {
          column.boundary.delete(simplexIndex);
        } else {
          column.boundary.add(simplexIndex);
        }
      });
      prevColumn.simplices.forEach((simplexIndex) => {
        if (column.simplices.has(simplexIndex)) {
          column.simplices.delete(simplexIndex);
        } else {
          column.simplices.add(simplexIndex);
        }
      });
    }
  });

  const birthsAndDeaths: {
    filtrationLevels: [number, number],
    birthEdges: [number, number][],
    deathTriangles: [number, number, number][],
  }[] = [];
  let maxBirth = 0.0;
  let maxPersistence = 0.0;
  lastIndex.forEach((columnIndex, last) => {
    if (last <= vertices.length) {
      return;
    }

    const birthColumn = columns[last - vertices.length];
    const deathColumn = columns[columnIndex];

    const birthEdges: [number, number][] = [];
    deathColumn.boundary.forEach((simplexIndex) => {
      const edge = simplices[simplexIndex - vertices.length];
      if (edge.length != 2) {
        throw new Error('Expected edge, got triangle.');
      }
      birthEdges.push(edge);
    });

    const deathTriangles: [number, number, number][] = [];
    deathColumn.simplices.forEach((simplexIndex) => {
      const triangle = simplices[simplexIndex];
      if (triangle.length != 3) {
        throw new Error('Expected triangle, got edge.');
      }
      deathTriangles.push(triangle);
    });

    if (birthColumn.filtrationLevel !== deathColumn.filtrationLevel) {
      birthsAndDeaths.push({
        filtrationLevels: [
          birthColumn.filtrationLevel,
          deathColumn.filtrationLevel,
        ],
        birthEdges,
        deathTriangles,
      });
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
          birthsAndDeaths.forEach(({ filtrationLevels: [birth, death] }) => {
            const point = [birth, death - birth];
            const weight = point[1];
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
