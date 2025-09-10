// 可视化JavaScript代码
(function() {
    const vscode = acquireVsCodeApi();
    
    let currentData = { nodes: [], edges: [] };
    let simulation;
    let svg;
    let deleteMode = false;
    let selectedNode = null;
    let selectedEdge = null;

    function initVisualization() {
        const container = d3.select('#visualization');
        const width = container.node().clientWidth;
        const height = container.node().clientHeight;

        svg = container.append('svg')
            .attr('width', width)
            .attr('height', height);

        // 添加箭头标记
        svg.append('defs').append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '-0 -5 10 10')
            .attr('refX', 25)
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('markerWidth', 5)
            .attr('markerHeight', 5)
            .attr('xoverflow', 'visible')
            .append('svg:path')
            .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
            .attr('fill', '#999')
            .style('stroke', 'none');

        setupEventListeners();
        updateVisualization();
    }

    function setupEventListeners() {
        document.getElementById('addNodeBtn').addEventListener('click', () => {
            const label = prompt('输入节点名称:');
            if (label) {
                vscode.postMessage({
                    command: 'addNode',
                    data: { label: label }
                });
            }
        });

        document.getElementById('addEdgeBtn').addEventListener('click', () => {
            if (currentData.nodes.length < 2) {
                alert('需要至少两个节点才能创建连接');
                return;
            }
            
            const sourceId = prompt('输入源节点ID (可用: ' + currentData.nodes.map(n => n.id).join(', ') + '):');
            const targetId = prompt('输入目标节点ID:');
            const label = prompt('输入连接标签 (可选):');
            
            if (sourceId && targetId) {
                vscode.postMessage({
                    command: 'addEdge',
                    data: { source: sourceId, target: targetId, label: label }
                });
            }
        });

        document.getElementById('deleteMode').addEventListener('click', () => {
            deleteMode = !deleteMode;
            document.getElementById('deleteMode').textContent = deleteMode ? '退出删除模式' : '删除模式';
            svg.classed('delete-mode', deleteMode);
        });

        document.getElementById('saveBtn').addEventListener('click', () => {
            vscode.postMessage({
                command: 'saveData',
                data: currentData
            });
        });

        // 窗口大小改变时重新调整
        window.addEventListener('resize', () => {
            const container = d3.select('#visualization');
            const width = container.node().clientWidth;
            const height = container.node().clientHeight;
            svg.attr('width', width).attr('height', height);
            
            if (simulation) {
                simulation.force('center', d3.forceCenter(width / 2, height / 2));
                simulation.alpha(0.3).restart();
            }
        });
    }

    function updateVisualization() {
        if (!svg || !currentData) return;

        const width = svg.attr('width');
        const height = svg.attr('height');

        // 清除现有内容
        svg.selectAll('*').remove();

        // 重新添加箭头标记
        svg.append('defs').append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '-0 -5 10 10')
            .attr('refX', 25)
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('markerWidth', 5)
            .attr('markerHeight', 5)
            .attr('xoverflow', 'visible')
            .append('svg:path')
            .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
            .attr('fill', '#999')
            .style('stroke', 'none');

        // 创建力导向模拟
        simulation = d3.forceSimulation(currentData.nodes)
            .force('link', d3.forceLink(currentData.edges).id(d => d.id).distance(100))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2));

        // 创建连接线
        const link = svg.append('g')
            .selectAll('line')
            .data(currentData.edges)
            .enter().append('line')
            .attr('class', 'link')
            .on('click', function(event, d) {
                if (deleteMode) {
                    vscode.postMessage({
                        command: 'deleteEdge',
                        edgeId: d.id
                    });
                }
            });

        // 创建节点
        const node = svg.append('g')
            .selectAll('circle')
            .data(currentData.nodes)
            .enter().append('circle')
            .attr('class', d => d.bookmarkId ? 'node bookmark' : 'node')
            .attr('r', 20)
            .on('click', function(event, d) {
                if (deleteMode) {
                    vscode.postMessage({
                        command: 'deleteNode',
                        nodeId: d.id
                    });
                } else if (d.bookmarkId) {
                    vscode.postMessage({
                        command: 'jumpToBookmark',
                        bookmarkId: d.bookmarkId
                    });
                }
            })
            .call(d3.drag()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended));

        // 添加节点标签
        const nodeLabel = svg.append('g')
            .selectAll('text')
            .data(currentData.nodes)
            .enter().append('text')
            .attr('class', 'node-label')
            .attr('dy', '.35em')
            .text(d => d.label);

        // 添加连接标签
        const edgeLabel = svg.append('g')
            .selectAll('text')
            .data(currentData.edges.filter(d => d.label))
            .enter().append('text')
            .attr('class', 'edge-label')
            .attr('dy', '.35em')
            .text(d => d.label);

        // 更新位置
        simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node
                .attr('cx', d => d.x)
                .attr('cy', d => d.y);

            nodeLabel
                .attr('x', d => d.x)
                .attr('y', d => d.y);

            edgeLabel
                .attr('x', d => (d.source.x + d.target.x) / 2)
                .attr('y', d => (d.source.y + d.target.y) / 2);
        });
    }

    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    // 监听来自扩展的消息
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'updateData':
                currentData = message.data;
                updateVisualization();
                break;
        }
    });

    // 初始化
    initVisualization();
})();
