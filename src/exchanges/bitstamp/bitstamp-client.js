const { EventEmitter } = require("events");
const winston = require("winston");
const Pusher = require("pusher-js");
const Trade = require("../../type/trade");
const Level2Point = require("../../type/level2-point");
const Level2Snapshot = require("../../type/level2-snapshot");
const Level2Update = require("../../type/level2-update");
const Level3Point = require("../../type/level3-point");
const Level3Update = require("../../type/level3-update");

class BitstampClient extends EventEmitter {
  constructor() {
    super();
    this._name = "Bitstamp";
    this._tradeSubs = new Map();
    this._level2SnapSubs = new Map();
    this._level2UpdateSubs = new Map();
    this._level3UpdateSubs = new Map();

    this.hasTrades = true;
    this.hasLevel2Snapshots = true;
    this.hasLevel2Updates = true;
    this.hasLevel3Snapshots = false;
    this.hasLevel3Updates = true;
  }

  subscribeTrades(market) {
    this._subscribe(
      market,
      this._tradeSubs,
      "subscribing to trades",
      this._sendSubTrades.bind(this)
    );
  }

  unsubscribeTrades(market) {
    this._unsubscribe(
      market,
      this._tradeSubs,
      "unsubscribing from trades",
      this._sendUnsubTrades.bind(this)
    );
  }

  subscribeLevel2Snapshots(market) {
    this._subscribe(
      market,
      this._level2SnapSubs,
      "subscribing to level2 spot",
      this._sendSubLevel2Snapshot.bind(this)
    );
  }

  unsubscribeLevel2Snapshots(market) {
    this._unsubscribe(
      market,
      this._level2SnapSubs,
      "unsubscribing from level2 spot",
      this._sendUnsubLevel2Snapshot.bind(this)
    );
  }

  subscribeLevel2Updates(market) {
    this._subscribe(
      market,
      this._level2UpdateSubs,
      "subscribing to level2 updates",
      this._sendSubLevel2Updates.bind(this)
    );
  }

  unsubscribeLevel2Updates(market) {
    this._unsubscribe(
      market,
      this._level2UpdateSubs,
      "unsubscribing from level2 updates",
      this._sendUnsubLevel2Updates.bind(this)
    );
  }

  subscribeLevel3Updates(market) {
    this._subscribe(
      market,
      this._level3UpdateSubs,
      "subscribing to level3 updates",
      this._sendSubLevel3Updates.bind(this)
    );
  }

  unsubscribeLevel3Updates(market) {
    this._subscribe(
      market,
      this._level3UpdateSubs,
      "unsubscribing from level3 updates",
      this._sendUnsubLevel3Updates.bind(this)
    );
  }

  close() {
    if (this._pusher) {
      this._pusher.disconnect();
      this._pusher = undefined;
    }
    this.emit("closed");
  }

  //////////////////////////////

  _connect() {
    if (!this._pusher) {
      this._pusher = new Pusher("de504dc5763aeef9ff52");
    }
  }

  _subscribe(market, map, msg, subFn) {
    this._connect();
    let remote_id = market.id;
    if (!map.has(remote_id)) {
      winston.info(msg, this._name, remote_id);
      map.set(remote_id, market);
      subFn(remote_id);
    }
  }

  _unsubscribe(market, map, msg, subFn) {
    let remote_id = market.id;
    if (map.has(remote_id)) {
      winston.info(msg, this._name, remote_id);
      map.delete(remote_id);
      subFn(remote_id);
    }
  }

  _sendSubTrades(remote_id) {
    let channelName = remote_id === "btcusd" ? "live_trades" : `live_trades_${remote_id}`;
    let channel = this._pusher.subscribe(channelName);
    channel.bind("trade", this._onTrade.bind(this, remote_id));
  }

  _sendUnsubTrades(remote_id) {
    let channelName = remote_id === "btcusd" ? "live_trades" : `live_trades_${remote_id}`;
    this._pusher.unsubscribe(channelName);
  }

  _onTrade(remote_id, msg) {
    let market = this._tradeSubs.get(remote_id);

    /*
    { amount: 0.363,
      buy_order_id: 1347930302,
      sell_order_id: 1347930276,
      amount_str: '0.36300000',
      price_str: '8094.97',
      timestamp: '1524058372',
      price: 8094.97,
      type: 0,
      id: 62696598 }
    */

    let trade = new Trade({
      exchange: "Bitstamp",
      base: market.base,
      quote: market.quote,
      tradeId: msg.id,
      unix: msg.timestamp * 1000,
      side: msg.type === 1 ? "sell" : "buy",
      price: msg.price_str,
      amount: msg.amount_str,
      buyOrderId: msg.buy_order_id,
      sellOrderId: msg.sell_order_id,
    });
    this.emit("trade", trade);
  }

  _sendSubLevel2Snapshot(remote_id) {
    let channelName = remote_id === "btcusd" ? "order_book" : `order_book_${remote_id}`;
    let channel = this._pusher.subscribe(channelName);
    channel.bind("data", this._onLevel2Snapshot.bind(this, remote_id));
  }

  _sendUnsubLevel2Snapshot(remote_id) {
    let channelName = remote_id === "btcusd" ? "order_book" : `order_book_${remote_id}`;
    this._pusher.unsubscribe(channelName);
  }

  _onLevel2Snapshot(remote_id, msg) {
    let market = this._level2SnapSubs.get(remote_id);
    let { bids, asks, timestamp } = msg;
    /*
    {
      "timestamp": "1528754789",
      "bids": [
        ["6778.10", "0.30000000"],
        ["6778.01", "0.02490239"],
        ["6778.00", "0.78593442"],
        ["6777.35", "20.23652315"],
        ["6776.20", "5.00000000"]
      ],
      "asks": [
        ["6780.00", "28.96553416"],
        ["6784.22", "0.00116447"],
        ["6788.21", "0.01000000"],
        ["6788.73", "1.00000000"],
        ["6790.00", "1.00000000"]
      ]
    }
    */

    bids = bids.map(([price, size]) => new Level2Point(price, size));
    asks = asks.map(([price, size]) => new Level2Point(price, size));

    let spot = new Level2Snapshot({
      exchange: "Bitstamp",
      base: market.base,
      quote: market.quote,
      timestampMs: timestamp * 1000,
      bids,
      asks,
    });

    this.emit("l2snapshot", spot);
  }

  _sendSubLevel2Updates(remote_id) {
    let channelName = remote_id === "btcusd" ? "diff_order_book" : `diff_order_book_${remote_id}`;
    let channel = this._pusher.subscribe(channelName);
    channel.bind("data", this._onLevel2Update.bind(this, remote_id));
  }

  _sendUnsubLevel2Updates(remote_id) {
    let channelName = remote_id === "btcusd" ? "diff_order_book" : `diff_order_book_${remote_id}`;
    this._pusher.unsubscribe(channelName);
  }

  _onLevel2Update(remote_id, msg) {
    let market = this._level2UpdateSubs.get(remote_id);
    let { bids, asks, timestamp } = msg;
    /*
    {
      "timestamp": "1528755218",
      "bids": [
        ["6762.72", "0.00000000"],
        ["6762.70", "0.00000000"],
        ["6759.82", "0.07750000"],
        ["6759.70", "1.47580000"],
        ["6745.50", "1.95000000"],
        ["6734.61", "0.46150000"],
        ["6733.82", "0.00000000"],
        ["6732.99", "0.00000000"]
      ],
      "asks": [
        ["6778.78", "0.28855655"],
        ["6778.79", "6.67991600"],
        ["6778.80", "1.47460000"],
        ["6778.88", "0.00000000"],
        ["6778.90", "0.00000000"],
        ["6779.99", "0.00000000"]
      ]
    }
    */

    bids = bids.map(([price, size]) => new Level2Point(price, size));
    asks = asks.map(([price, size]) => new Level2Point(price, size));

    let update = new Level2Update({
      exchange: "Bitstamp",
      base: market.base,
      quote: market.quote,
      timestampMs: timestamp * 1000,
      bids,
      asks,
    });

    this.emit("l2update", update);
  }

  _sendSubLevel3Updates(remote_id) {
    let channelName = remote_id === "btcusd" ? "live_orders" : `live_orders_${remote_id}`;
    let channel = this._pusher.subscribe(channelName);
    channel.bind("order_created", this._onLevel3Update.bind(this, remote_id, "created"));
    channel.bind("order_changed", this._onLevel3Update.bind(this, remote_id, "changed"));
    channel.bind("order_deleted", this._onLevel3Update.bind(this, remote_id, "deleted"));
  }

  _sendUnsubLevel3Updates(remote_id) {
    let channelName = remote_id === "btcusd" ? "live_orders" : `live_orders${remote_id}`;
    this._pusher.unsubscribe(channelName);
  }

  _onLevel3Update(remote_id, type, msg) {
    let market = this._level3UpdateSubs.get(remote_id);

    /*
    {
      order_type: 1,
      price: 6844.1,
      datetime: '1528757709',
      amount: 2.66106012,
      id: 1667122035,
      microtimestamp: '1528757717001990'
    }
    */

    let asks = [];
    let bids = [];

    let timestampMs = Math.trunc(msg.microtimestamp / 1000); // comes in in microseconds
    let point = new Level3Point(msg.id, msg.price.toFixed(8), msg.amount.toFixed(8), { type });

    if (msg.order_type === 0) bids.push(point);
    else asks.push(point);

    let update = new Level3Update({
      exchange: "Bitstamp",
      base: market.base,
      quote: market.quote,
      timestampMs,
      asks,
      bids,
    });

    this.emit("l3update", update);
  }
}

module.exports = BitstampClient;
