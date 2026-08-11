import { createServer } from "node:http";

import { defineQueryModel, param } from "@queryweave/core";
import { readNodeQuery } from "@queryweave/node";
import { createQueryUrl, encodeQuery } from "@queryweave/server";

const productFilters = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
  sort: param.choice(["name", "created_at", "price"]).default("created_at"),
  tags: param.list(param.text()).default([]),
});

const server = createServer((request, response) => {
  const decoded = readNodeQuery(request, productFilters);
  const values = decoded.ok ? decoded.value : { ...productFilters.defaults(), ...decoded.partial };

  const nextPage = createQueryUrl("http://localhost:3000/products", productFilters, {
    ...values,
    page: values.page + 1,
  });

  response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  response.end(
    JSON.stringify(
      {
        status: decoded.ok ? "valid" : "invalid",
        values,
        issues: decoded.issues,
        canonical: encodeQuery(productFilters, values),
        nextPage: nextPage.href,
      },
      undefined,
      2,
    ),
  );
});

const port = Number(process.env["PORT"] ?? 3000);
server.listen(port, () => {
  console.info(`QueryWeave Node playground listening on http://localhost:${String(port)}`);
});
