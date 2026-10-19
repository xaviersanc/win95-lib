// Faux client supabase-js pour les tests (injecté AVANT la bibliothèque : window.supabase = { createClient }).
// Il implémente le sous-ensemble utilisé par la bibliothèque : from(table).select/insert/upsert/update/delete + eq/in/order/single,
// et storage.from(bucket).upload/download/remove/createSignedUrl. La base est en mémoire (window.__mockSupabase.db) pour les assertions.
// Il imite aussi le trigger de quota de supabase/02-user-files.sql (erreur QUOTA_EXCEEDED).
(() => {
    const db = { tables: {}, buckets: {}, calls: [] };
    const QUOTA = window.__mockQuotaBytes || 100 * 1024 * 1024;
    let counter = 0;
    const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
    const table = (name) => (db.tables[name] = db.tables[name] || []);

    class Query {
        constructor(name) {
            this.name = name;
            this.op = "select";
            this.filters = [];
            this.single_ = false;
            this.order_ = null;
            this.returning = false;
        }

        select() {
            if (this.op !== "select") {
                this.returning = true;
            }
            return this;
        }

        insert(payload) { this.op = "insert"; this.payload = payload; return this; }
        upsert(payload) { this.op = "upsert"; this.payload = payload; return this; }
        update(payload) { this.op = "update"; this.payload = payload; return this; }
        delete() { this.op = "delete"; return this; }
        eq(column, value) { this.filters.push((row) => row[column] === value); return this; }
        in(column, values) { this.filters.push((row) => values.includes(row[column])); return this; }
        order(column, { ascending = true } = {}) { this.order_ = { column, ascending }; return this; }
        single() { this.single_ = true; return this; }

        run() {
            const rows = table(this.name);
            const match = (row) => this.filters.every((filter) => filter(row));
            db.calls.push({ table: this.name, op: this.op });
            let data = null;
            if (this.op === "select") {
                data = rows.filter(match);
            } else if (this.op === "insert" || this.op === "upsert") {
                const record = { id: uuid(), created_at: new Date().toISOString(), trashed_at: null, ...this.payload };
                if (this.name === "user_files") {
                    const used = rows.filter((row) => row.owner === record.owner && row.id !== record.id).reduce((sum, row) => sum + (Number(row.size) || 0), 0);
                    if (used + (Number(record.size) || 0) > QUOTA) {
                        return { data: null, error: { message: "QUOTA_EXCEEDED", details: `${used} + ${record.size} > ${QUOTA}` } };
                    }
                    const clash = rows.some((row) => row.owner === record.owner && (row.parent_id || null) === (record.parent_id || null)
                        && row.name.toLowerCase() === record.name.toLowerCase() && !row.trashed_at && !record.trashed_at);
                    if (clash) {
                        return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
                    }
                }
                const existing = this.op === "upsert" ? rows.findIndex((row) => row.id === record.id) : -1;
                if (existing >= 0) {
                    rows[existing] = { ...rows[existing], ...this.payload };
                } else {
                    rows.push(record);
                }
                data = [record];
            } else if (this.op === "update") {
                data = rows.filter(match);
                data.forEach((row) => Object.assign(row, this.payload));
            } else if (this.op === "delete") {
                const doomed = new Set(rows.filter(match).map((row) => row.id));
                // on delete cascade des sous-éléments
                let grew = true;
                while (grew) {
                    grew = false;
                    rows.forEach((row) => {
                        if (row.parent_id && doomed.has(row.parent_id) && !doomed.has(row.id)) {
                            doomed.add(row.id);
                            grew = true;
                        }
                    });
                }
                db.tables[this.name] = rows.filter((row) => !doomed.has(row.id));
                data = [];
            }
            if (this.order_ && Array.isArray(data)) {
                const { column, ascending } = this.order_;
                data = data.slice().sort((left, right) => (String(left[column]).localeCompare(String(right[column]))) * (ascending ? 1 : -1));
            }
            if (this.single_ && Array.isArray(data)) {
                data = data[0] || null;
            }
            if (!this.returning && ["insert", "upsert", "update", "delete"].includes(this.op)) {
                data = null;
            }
            return { data, error: null };
        }

        then(resolve, reject) {
            return Promise.resolve(this.run()).then(resolve, reject);
        }
    }

    const bucket = (name) => (db.buckets[name] = db.buckets[name] || new Map());
    const storage = {
        from(name) {
            return {
                async upload(path, blob) {
                    if (bucket(name).has(path)) {
                        return { data: null, error: { message: "The resource already exists" } };
                    }
                    bucket(name).set(path, blob);
                    return { data: { path }, error: null };
                },
                async download(path) {
                    const blob = bucket(name).get(path);
                    return blob ? { data: blob, error: null } : { data: null, error: { message: "Object not found" } };
                },
                async remove(paths) {
                    paths.forEach((path) => bucket(name).delete(path));
                    return { data: paths, error: null };
                },
                async createSignedUrl(path) {
                    const blob = bucket(name).get(path);
                    return blob ? { data: { signedUrl: URL.createObjectURL(blob) }, error: null } : { data: null, error: { message: "Object not found" } };
                }
            };
        }
    };

    const client = { from: (name) => new Query(name), storage };
    window.__mockSupabase = { db, client };
    window.supabase = { createClient: () => client };
})();
