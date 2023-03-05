import { describe, it, expect } from "vitest"

import { getDateString } from "./utils"

describe("getDateString", () => {
    it("right", () => {
        let date = new Date(2023, 2, 4);
        expect(getDateString(date)).toBe("20230304");
        expect(getDateString(date)).to.equal("20230304");
    });
});