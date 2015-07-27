var messageCompress = require('../client/lib/messageCompress')
    .messageCompress;
var simClient = function(sandboxClient, simulationManager)
{
    this.manager = simulationManager;
    this.sandboxClient = sandboxClient;
    this.nodesSimulating = [];
    this.startSimulatingScene = function()
    {
        var nodes = this.manager.world.state.children('index-vwf')
        for (var i = 0; i < nodes.length; i++)
        {
            if (this.nodesSimulating.indexOf(nodes[i]) == -1)
                this.nodesSimulating.push(nodes[i])
        }
        this.sendStartSimMessage('index-vwf');
    }
    this.startSimulatingNode = function(nodeID)
    {
        if (this.manager.world.state.findNode(nodeID))
            if (this.nodesSimulating.indexOf(nodeID) == -1)
                this.nodesSimulating.push(nodeID)
        this.sendStartSimMessage(nodeID);
    }
    this.isSimulating = function(nodeid)
    {
        return this.nodesSimulating.indexOf(nodeid) !== -1;
    }
    this.stopSimulatingNode = function(nodeID)
    {
        if (this.manager.world.state.findNode(nodeID))
            if (this.nodesSimulating.indexOf(nodeID) != -1)
                this.nodesSimulating.splice(this.nodesSimulating.indexOf(nodeID), 1)
        this.sendStopSimMessage(nodeID);
    }
    this.sendStopSimMessage = function(nodeID)
    {
        this.sandboxClient.emit('message', messageCompress.pack(JSON.stringify(
        {
            "action": "stopSimulating",
            "parameters": [nodeID],
            "time": this.manager.world.time
        })));
    }
    this.sendStartSimMessage = function(nodeID)
    {
        console.log('sendStartSimMessage')
        this.sandboxClient.emit('message', messageCompress.pack(JSON.stringify(
        {
            "action": "startSimulating",
            "parameters": [nodeID],
            "time": this.manager.world.time
        })));
    }
}
var simulationManager = function(world)
{
    this.world = world;
    this.clients = {};
    this.clientControlTable = {}; //learn which clients need to simulate locally most

    //once a second look for client that most needs to simulate a node, and change owners
    this.postLearnedMappings = function(){
        for(var i in this.clientControlTable)
        {
            for(var j in this.clientControlTable[i])
                this.clientControlTable[i][j] = Math.pow(this.clientControlTable[i][j],.99); // approach 0
        }
       


    }.bind(this);
    setInterval(this.postLearnedMappings,1000);

    this.addClient = function(sandboxClient)
    {
        var newClient = new simClient(sandboxClient, this);
        //must add to list to get proper average load, then remove so we don't keep distributing
        //nodes from new client to new client
        this.clients[sandboxClient.id] = newClient;
        var average = this.clientAverageLoad();
        delete this.clients[sandboxClient.id];
        var counter = 0;
        //divide up work distribute until new client shares load
        while (newClient.nodesSimulating.length < average)
        {
            var nextClient = this.clients[Object.keys(this.clients)[counter]];
            var node = nextClient.nodesSimulating[0];
            if (node)
            {
                nextClient.stopSimulatingNode(node);
                newClient.startSimulatingNode(node);
            }
            counter++;
            counter = counter % this.clientCount();
        }
        this.clients[sandboxClient.id] = newClient;
    }
    this.clientCount = function()
    {
        return (Object.keys(this.clients).length);
    }
    this.removeClient = function(sandboxClient)
    {
        var oldNodes = this.clients[sandboxClient.id].nodesSimulating;
        delete this.clients[sandboxClient.id];
        //redistribute the nodes the client had been simulating
        this.distribute(oldNodes);
    }
    this.distribute = function(nodes)
    {
        while (nodes.length)
        {
            for (var i in this.clients)
            {
                var node = nodes.shift();
                if (node)
                    this.clients[i].startSimulatingNode(node);
            }
        }
    }
    this.getClientForNode = function(nodeid)
    {
        for (var i in this.clients)
            if (this.clients[i].isSimulating(nodeid))
                return this.clients[i];
        return null;
    }
    this.clientAverageLoad = function()
    {
        var total = 0
        for (var i in this.clients)
            total += this.clients[i].nodesSimulating.length;
        return total / this.clientCount();
    }
    this.startScene = function()
    {
        this.clients[Object.keys(this.clients)[0]].startSimulatingScene();
    }
    this.nodeCreated = function(nodeid, creatingClient)
    {
        //careful to keep objects in islands by their root
        var rootID = this.world.state.ancestors(nodeid)[1];
        if (!rootID)
        {
            this.clients[creatingClient.id].startSimulatingNode(nodeid);
            console.log(creatingClient.id + " start simulation " + nodeid);
        }
        else
            this.getClientForNode(rootID).startSimulatingNode(nodeid);
    }
    this.nodeDeleted = function(nodeid)
    {
        this.getClientForNode(nodeid).stopSimulatingNode(nodeid);
    }
    this.updateClientControlTable = function(nodeid,sendingClient)
    {
        if(nodeid == "index-vwf") return;
        var record = this.clientControlTable[nodeid];
        if(! record)
        {
            record = this.clientControlTable[nodeid] = {};
        }
        if(!record[sendingClient.id])
            record[sendingClient.id] = 0;
        record[sendingClient.id]++;
    }
    this.getClientsForMessage = function(type, nodeid , sendingClient)
    {
        // ancestors[0] should be index-vwf. 1 is the root. 
        //remember that we assign simulation by the root under scene
        var nodeid = this.world.state.ancestors(nodeid)[1] || nodeid;
        var clients = [];
        for (var i in this.clients)
        {
            if (type == 'setProperty' || type == 'callMethod' || type == 'fireEvent')
            {
                if (this.clients[i].isSimulating(nodeid) || nodeid == 'index-vwf')
                    clients.push(this.clients[i].sandboxClient)
                
                this.updateClientControlTable(nodeid,sendingClient)
            }else
            {
                clients.push(this.clients[i].sandboxClient);
            }
        }
        
           
        return clients;
    }
}
exports.simulationManager = simulationManager;