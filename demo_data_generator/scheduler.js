export class Scheduler {
  constructor(){this.taskTimer=null;this.heartbeatTimer=null;}
  start(task,milliseconds,heartbeat,heartbeatMilliseconds=30000){this.stop();this.taskTimer=setInterval(()=>task().catch(console.error),milliseconds);if(heartbeat)this.heartbeatTimer=setInterval(()=>heartbeat().catch(console.error),heartbeatMilliseconds);}
  stop(){if(this.taskTimer)clearInterval(this.taskTimer);if(this.heartbeatTimer)clearInterval(this.heartbeatTimer);this.taskTimer=null;this.heartbeatTimer=null;}
  get running(){return Boolean(this.taskTimer);}
}
