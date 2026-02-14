import express from "express";

const app = express();
app.use(express.json());

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

if (!AIRTABLE_TOKEN || !BASE_ID || !INTERNAL_API_KEY) {
  console.warn("Faltan env vars: AIRTABLE_TOKEN, AIRTABLE_BASE_ID, INTERNAL_API_KEY");
}

// 🔒 Tablas permitidas + campos (whitelist) + campos bloqueados
const TABLES = {
  "Operativo Laboratorios": {
    idOrName: "Operativo Laboratorios",
    allowed: new Set([
      "ID Cita","Proveedor","PIF","Fecha de Creación Cita","FechaDeCita",
      "ESTATUS","Incidencias","ANALISTA","Campaña del cliente",
      "LAB REASIGNADO","Laboratorio Reasignado","TituloDelServicio",
      "Día asignado a analista","Hora Creación Cita","Origen","Status",
      "FechaHoy","Categoría del servicio","Generoform",
      "FechadeATENCION(controlAsign)","Fin de vigencia",
      "Costo PIF","Costo PIF + IVA","Entidad Federativa","Municipios",
    ]),
    blocked: new Set(["Dirección del servicio","FechadeNacimientooo"]),
  },

  "HEXALUD RED": {
    idOrName: "HEXALUD RED",
    allowed: new Set([
      "Proveedor Hexalud","StatusActual","Campaña","Linea de negocio",
      "Tipo de red","Nombre del Medico","Detalle del convenio referencia",
      "Puntos importantes","Cupon","Entidad Federativa","Municipios",
      "FOTO","Profesión","Especialidad",
    ]),
    blocked: new Set([
      "Direccion Completa","Referencias de ubicacion","Tel 1","Tel 2",
      "Correos","Latitud","Longitud",
    ]),
  },
};

function auth(req, res, next) {
  const key = req.header("x-api-key");
  if (!key || key !== INTERNAL_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function getTableConfig(table) {
  const cfg = TABLES[table];
  if (!cfg) throw new Error(`Tabla no permitida: ${table}`);
  return cfg;
}

function pickFields(cfg, requested) {
  const base = [...cfg.allowed].filter(f => !cfg.blocked.has(f));
  if (!Array.isArray(requested) || requested.length === 0) return base;
  return requested
    .filter(f => cfg.allowed.has(f))
    .filter(f => !cfg.blocked.has(f));
}

async function airtableFetch(tableNameOrId, queryString = "") {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tableNameOrId)}${queryString}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return data;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/query", auth, async (req, res) => {
  try {
    const { table, filterByFormula, maxRecords = 50, fields, sort } = req.body;
    const cfg = getTableConfig(table);

    const safeFields = pickFields(cfg, fields);
    const safeMax = Math.max(1, Math.min(100, Number(maxRecords) || 50));

    const params = new URLSearchParams();
    if (filterByFormula) params.set("filterByFormula", filterByFormula);
    params.set("maxRecords", String(safeMax));
    safeFields.forEach(f => params.append("fields[]", f));

    if (Array.isArray(sort)) {
      sort.slice(0, 3).forEach((s, i) => {
        if (s?.field && cfg.allowed.has(s.field) && !cfg.blocked.has(s.field)) {
          params.set(`sort[${i}][field]`, s.field);
          params.set(`sort[${i}][direction]`, s.direction === "asc" ? "asc" : "desc");
        }
      });
    }

    const data = await airtableFetch(cfg.idOrName, `?${params.toString()}`);
    res.json({
      table,
      records: (data.records || []).map(r => ({ id: r.id, fields: r.fields })),
      offset: data.offset || null,
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on ${port}`));
