import {ExposedThing, Servient} from "@node-wot/core";
import {HttpServer} from "@node-wot/binding-http";
import {MqttBrokerServer} from "@node-wot/binding-mqtt";
import {Thing} from "@node-wot/td-tools";

const servient = new Servient();

//servient.addServer(new HttpServer());
servient.addServer(new MqttBrokerServer({
    uri: "tcp://localhost:1883",
    // @ts-ignore
    username: "wot1@ctron-wot",
    password: "foobar",
    clientId: "wot1." + Date.now(),
    protocolVersion: 5,
}));

class ObservableCounter {
    private readonly thing: WoT.ExposedThing;
    private readonly name: string;

    private value: number;

    constructor(thing: WoT.ExposedThing, name: string, initialValue: number) {
        this.thing = thing;
        this.name = name;
        this.value = initialValue;

        this.thing.setPropertyReadHandler("counter", async () => {
            return await this.read();
        });
        this.thing.setPropertyWriteHandler("counter", async (request) => {
            const value = await request.value();
            if (typeof value === "number") {
                await this.write(value);
            }
        });
    }

    async read(): Promise<number> {
        return this.value;
    }

    async write(value: number) {
        this.value = value;
        await this.thing.emitPropertyChange(this.name);
    }

    async modify(f: (a: number) => number) {
        const n = f(this.value);
        console.debug("Modify - old:", this.value, "new:", n)
        await this.write(n);
    }
}

function inc(counter: ObservableCounter) {
    setTimeout(() => {
        counter.modify((x) => x + 1)
            .finally(() => {
                inc(counter);
            });
    }, 1000);
}

servient.start().then(async (WoT) => {
    let thing = await WoT.produce({
        id: "urn:wot1",
        title: "wot1",
        properties: {
            counter: {
                type: "integer",
                observable: true,
                writeOnly: false,
                readOnly: false,
            }
        },
        events: {
            counter: {
                data: {
                    type: "integer"
                }
            }
        },
        actions: {
            reset: {}
        }
    });

    let counter = new ObservableCounter(thing, "counter", 0);

    thing.setActionHandler("reset", async (params, options) => {
        console.debug("Reset - params: ", params, ", options: ", options);
        await counter.write(0);
    });

    await thing.expose();

    // start to increment
    inc(counter);

    const thingId = thing.getThingDescription().id;
    console.info(`Thing ${thingId} ready`);

});
