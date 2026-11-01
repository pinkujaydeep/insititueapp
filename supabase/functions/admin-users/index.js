"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
// Staff account management. Runs server-side with the service-role key, which never reaches the browser.
// Only callers with the `users.manage` permission (Super Admin) may use it.
var supabase_js_2_1 = require("npm:@supabase/supabase-js@2");
var SUPABASE_URL = Deno.env.get("SUPABASE_URL");
var ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
var SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var ALLOWED_ORIGINS = ((_a = Deno.env.get("ALLOWED_ORIGINS")) !== null && _a !== void 0 ? _a : "*").split(",").map(function (o) { return o.trim(); });
var ROLES = ["super_admin", "administrator", "accounts_staff", "admissions_staff"];
var EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function corsHeaders(origin) {
    var allowed = ALLOWED_ORIGINS.includes("*") || (origin && ALLOWED_ORIGINS.includes(origin));
    return {
        "Access-Control-Allow-Origin": allowed ? (origin !== null && origin !== void 0 ? origin : "*") : ALLOWED_ORIGINS[0],
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        Vary: "Origin",
    };
}
var HttpError = /** @class */ (function (_super) {
    __extends(HttpError, _super);
    function HttpError(status, message) {
        var _this = _super.call(this, message) || this;
        _this.status = status;
        return _this;
    }
    return HttpError;
}(Error));
function validatePassword(password) {
    if (typeof password !== "string" || password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        throw new HttpError(400, "Password must be 8-72 characters and contain letters and numbers");
    }
    return password;
}
function validateRoles(roles) {
    if (!Array.isArray(roles) || roles.length === 0 || roles.some(function (r) { return !ROLES.includes(r); })) {
        throw new HttpError(400, "Select at least one valid role");
    }
    return __spreadArray([], new Set(roles), true);
}
function validateUserId(id) {
    if (typeof id !== "string" || !UUID_RE.test(id))
        throw new HttpError(400, "Invalid user id");
    return id;
}
Deno.serve(function (req) { return __awaiter(void 0, void 0, void 0, function () {
    var cors, json, authHeader, caller, _a, userData_1, userError, _b, profile, profileError, actorId_1, admin_1, audit, body, _c, email, fullName, phone, password, roles, _d, created, error, userId_1, insertError, roleError, _e, userId, isActive, error, banError, userId, password, error, err_1, status_1, message;
    var _f, _g, _h, _j;
    return __generator(this, function (_k) {
        switch (_k.label) {
            case 0:
                cors = corsHeaders(req.headers.get("Origin"));
                if (req.method === "OPTIONS")
                    return [2 /*return*/, new Response("ok", { headers: cors })];
                json = function (body, status) {
                    if (status === void 0) { status = 200; }
                    return new Response(JSON.stringify(body), { status: status, headers: __assign(__assign({}, cors), { "Content-Type": "application/json" }) });
                };
                _k.label = 1;
            case 1:
                _k.trys.push([1, 23, , 24]);
                if (req.method !== "POST")
                    throw new HttpError(405, "Method not allowed");
                authHeader = req.headers.get("Authorization");
                if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith("Bearer ")))
                    throw new HttpError(401, "Not signed in");
                caller = (0, supabase_js_2_1.createClient)(SUPABASE_URL, ANON_KEY, {
                    global: { headers: { Authorization: authHeader } },
                    auth: { persistSession: false, autoRefreshToken: false },
                });
                return [4 /*yield*/, caller.auth.getUser(authHeader.slice(7))];
            case 2:
                _a = _k.sent(), userData_1 = _a.data, userError = _a.error;
                if (userError || !userData_1.user)
                    throw new HttpError(401, "Session expired. Please sign in again.");
                return [4 /*yield*/, caller.rpc("my_profile")];
            case 3:
                _b = _k.sent(), profile = _b.data, profileError = _b.error;
                if (profileError || !((_f = profile === null || profile === void 0 ? void 0 : profile.permissions) === null || _f === void 0 ? void 0 : _f.includes("users.manage"))) {
                    throw new HttpError(403, "Only a Super Admin can manage staff accounts");
                }
                actorId_1 = userData_1.user.id;
                admin_1 = (0, supabase_js_2_1.createClient)(SUPABASE_URL, SERVICE_ROLE_KEY, {
                    auth: { persistSession: false, autoRefreshToken: false },
                });
                audit = function (action, recordId, data) {
                    return admin_1.from("audit_logs").insert({
                        actor_id: actorId_1,
                        actor_email: userData_1.user.email,
                        action: action,
                        table_name: "auth.users",
                        record_id: recordId,
                        new_data: data,
                    });
                };
                return [4 /*yield*/, req.json().catch(function () {
                        throw new HttpError(400, "Invalid JSON body");
                    })];
            case 4:
                body = _k.sent();
                _c = body === null || body === void 0 ? void 0 : body.action;
                switch (_c) {
                    case "create": return [3 /*break*/, 5];
                    case "set_active": return [3 /*break*/, 14];
                    case "set_password": return [3 /*break*/, 18];
                }
                return [3 /*break*/, 21];
            case 5:
                email = String((_g = body.email) !== null && _g !== void 0 ? _g : "").trim().toLowerCase();
                fullName = String((_h = body.full_name) !== null && _h !== void 0 ? _h : "").replace(/[<>\u0000-\u001f]/g, "").trim();
                phone = body.phone ? String(body.phone).replace(/[^\d+\s-]/g, "").trim().slice(0, 30) : null;
                if (!EMAIL_RE.test(email) || email.length > 200)
                    throw new HttpError(400, "Enter a valid email address");
                if (fullName.length < 2 || fullName.length > 100)
                    throw new HttpError(400, "Enter the full name (2-100 characters)");
                password = validatePassword(body.password);
                roles = validateRoles(body.roles);
                return [4 /*yield*/, admin_1.auth.admin.createUser({
                        email: email,
                        password: password,
                        email_confirm: true,
                        user_metadata: { full_name: fullName },
                    })];
            case 6:
                _d = _k.sent(), created = _d.data, error = _d.error;
                if (error || !created.user) {
                    throw new HttpError((error === null || error === void 0 ? void 0 : error.status) === 422 ? 409 : 400, (_j = error === null || error === void 0 ? void 0 : error.message) !== null && _j !== void 0 ? _j : "Could not create user");
                }
                userId_1 = created.user.id;
                return [4 /*yield*/, admin_1
                        .from("admin_users")
                        .insert({ id: userId_1, email: email, full_name: fullName, phone: phone })];
            case 7:
                insertError = (_k.sent()).error;
                if (!insertError) return [3 /*break*/, 8];
                _e = { error: insertError };
                return [3 /*break*/, 10];
            case 8: return [4 /*yield*/, admin_1.from("user_roles").insert(roles.map(function (role) { return ({ user_id: userId_1, role: role, granted_by: actorId_1 }); }))];
            case 9:
                _e = _k.sent();
                _k.label = 10;
            case 10:
                roleError = (_e).error;
                if (!(insertError || roleError)) return [3 /*break*/, 12];
                return [4 /*yield*/, admin_1.auth.admin.deleteUser(userId_1)];
            case 11:
                _k.sent();
                throw new HttpError(400, (insertError !== null && insertError !== void 0 ? insertError : roleError).message);
            case 12: return [4 /*yield*/, audit("CREATE_STAFF", userId_1, { email: email, full_name: fullName, roles: roles })];
            case 13:
                _k.sent();
                return [2 /*return*/, json({ id: userId_1, email: email, full_name: fullName, roles: roles }, 201)];
            case 14:
                userId = validateUserId(body.user_id);
                if (userId === actorId_1)
                    throw new HttpError(400, "You cannot deactivate your own account");
                isActive = body.is_active === true;
                return [4 /*yield*/, admin_1.from("admin_users").update({ is_active: isActive }).eq("id", userId)];
            case 15:
                error = (_k.sent()).error;
                if (error)
                    throw new HttpError(error.code === "PT409" ? 409 : 400, error.message);
                return [4 /*yield*/, admin_1.auth.admin.updateUserById(userId, {
                        ban_duration: isActive ? "none" : "876000h",
                    })];
            case 16:
                banError = (_k.sent()).error;
                if (banError)
                    throw new HttpError(400, banError.message);
                return [4 /*yield*/, audit(isActive ? "ACTIVATE_STAFF" : "DEACTIVATE_STAFF", userId, { is_active: isActive })];
            case 17:
                _k.sent();
                return [2 /*return*/, json({ id: userId, is_active: isActive })];
            case 18:
                userId = validateUserId(body.user_id);
                if (userId === actorId_1)
                    throw new HttpError(400, "Change your own password from Settings");
                password = validatePassword(body.password);
                return [4 /*yield*/, admin_1.auth.admin.updateUserById(userId, { password: password })];
            case 19:
                error = (_k.sent()).error;
                if (error)
                    throw new HttpError(400, error.message);
                return [4 /*yield*/, audit("RESET_STAFF_PASSWORD", userId, {})];
            case 20:
                _k.sent();
                return [2 /*return*/, json({ id: userId })];
            case 21: throw new HttpError(400, "Unknown action");
            case 22: return [3 /*break*/, 24];
            case 23:
                err_1 = _k.sent();
                status_1 = err_1 instanceof HttpError ? err_1.status : 500;
                message = err_1 instanceof HttpError ? err_1.message : "Unexpected server error";
                if (status_1 === 500)
                    console.error(err_1);
                return [2 /*return*/, json({ error: message }, status_1)];
            case 24: return [2 /*return*/];
        }
    });
}); });
