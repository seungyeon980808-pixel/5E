'use strict';

class GlobalGenerationScheduler {
  constructor({ maxRunning = 10 } = {}) {
    if (!Number.isSafeInteger(maxRunning) || maxRunning < 1) throw new Error('maxRunning must be a positive integer');
    this.maxRunning = maxRunning;
    this.running = new Set();
    this.queues = new Map();
    this.ownerOrder = [];
  }
  enqueue(owner, actions) {
    if (typeof owner !== 'string' || !owner || typeof actions?.start !== 'function') throw new Error('Invalid scheduled generation');
    const ticket = {
      owner,
      state: 'queued',
      release: () => this.release(ticket),
      cancel: () => this.cancel(ticket, actions.cancel),
    };
    if (this.running.size < this.maxRunning && this.ownerOrder.length === 0) this.admit(ticket, actions.start);
    else {
      const queue = this.queues.get(owner) || [];
      queue.push({ ticket, start: actions.start });
      this.queues.set(owner, queue);
      if (!this.ownerOrder.includes(owner)) this.ownerOrder.push(owner);
    }
    return ticket;
  }
  admit(ticket, start) {
    ticket.state = 'running';
    this.running.add(ticket);
    try { start(); }
    catch (error) { this.release(ticket); throw error; }
  }
  pump() {
    while (this.running.size < this.maxRunning && this.ownerOrder.length) {
      const owner = this.ownerOrder.shift();
      const queue = this.queues.get(owner);
      const next = queue?.shift();
      if (!next) { this.queues.delete(owner); continue; }
      if (queue.length) this.ownerOrder.push(owner);
      else this.queues.delete(owner);
      this.admit(next.ticket, next.start);
    }
  }
  release(ticket) {
    if (ticket.state !== 'running' && ticket.state !== 'cancelling') return false;
    this.running.delete(ticket);
    ticket.state = ticket.state === 'cancelling' ? 'cancelled' : 'completed';
    this.pump();
    return true;
  }
  cancel(ticket, cancelAction) {
    if (ticket.state === 'queued') {
      const queue = this.queues.get(ticket.owner) || [];
      const index = queue.findIndex(entry => entry.ticket === ticket);
      if (index < 0) return false;
      queue.splice(index, 1);
      if (!queue.length) {
        this.queues.delete(ticket.owner);
        this.ownerOrder = this.ownerOrder.filter(owner => owner !== ticket.owner);
      }
      ticket.state = 'cancelled';
      try {
        const result = cancelAction?.();
        result?.catch?.(() => {});
      } catch {}
      return true;
    }
    if (ticket.state !== 'running') return false;
    ticket.state = 'cancelling';
    let result;
    try { result = cancelAction?.(); }
    catch (error) { this.release(ticket); throw error; }
    if (result && typeof result.finally === 'function') result.finally(() => this.release(ticket));
    else this.release(ticket);
    return true;
  }
  status() {
    let queued = 0;
    for (const queue of this.queues.values()) queued += queue.length;
    return { maxRunning: this.maxRunning, running: this.running.size, queued };
  }
  position(ticket) {
    if (!ticket || ticket.state !== 'queued') return 0;
    const queues = new Map([...this.queues].map(([owner, queue]) => [owner, [...queue]]));
    const owners = [...this.ownerOrder];
    let position = 0;
    while (owners.length) {
      const owner = owners.shift();
      const queue = queues.get(owner) || [];
      const next = queue.shift();
      if (!next) continue;
      position += 1;
      if (next.ticket === ticket) return position;
      if (queue.length) owners.push(owner);
    }
    return 0;
  }
  runningTickets() { return [...this.running]; }
}

module.exports = { GlobalGenerationScheduler };
