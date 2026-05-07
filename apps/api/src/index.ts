interface ServiceStatus {
  readonly service: "api";
  readonly ready: boolean;
  readonly timestamp: string;
}

const status: ServiceStatus = {
  service: "api",
  ready: true,
  timestamp: new Date().toISOString()
};

console.log("[api] Network Monitor API workspace ready.");
console.log(status);
