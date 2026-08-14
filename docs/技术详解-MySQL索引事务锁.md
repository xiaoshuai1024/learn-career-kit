# MySQL 索引 / 事务 / 锁 / 性能优化 · 面试深度教材

> **适用场景**：技术总监 / 后端架构师 / 资深全栈面试深水区。
> **触发**：2026-08-05 赛微瑞云技术总监面试当场失分（B+树漏叶子双向链表、聚簇vs二级错配、三现象说反）。
> **贯穿业务**：电商订单系统（`order` / `order_item` / `user` / `product` / `merchant` 表）。
> **学习路径**：先讲透原理 → 再上面试连环追问 → 最后给工业级落地。
> **关联**：`docs/错题本.md` SQL-01 / SPR-02 ｜ `docs/岗位能力图谱-严格版.md` 2.4 漏洞表 `backend.mysql`（当前 40 分，目标 60+）。

---

## 目录

1. [为什么需要这一章（痛点场景推演）](#1)
2. [存储引擎：InnoDB vs MyISAM 一句话决策](#2)
3. [索引原理：B+ 树为什么是 B+ 树](#3)
   - 3.1 为什么不用 B 树 / 红黑树 / 跳表 / Hash
   - 3.2 B+ 树结构详解（画图）
   - 3.3 聚簇索引 vs 二级索引（回表是面试核心）
   - 3.4 覆盖索引 / 索引下推 ICP / 最左前缀
   - 3.5 索引失效的 12 种场景
4. [事务：ACID / 隔离级别 / MVCC / 锁](#4)
   - 4.1 ACID 四特性谁保谁
   - 4.2 四种隔离级别 + 三现象（脏读/不可重复读/幻读）
   - 4.3 MVCC 原理：ReadView + undo 版本链
   - 4.4 三大日志：redo / undo / binlog + 两阶段提交
   - 4.5 锁全家桶：行锁/间隙锁/Next-Key/意向锁/MDL
5. [性能优化：EXPLAIN 全字段 + 慢 SQL 排查链](#5)
6. [工业级落地：生产参数 / 表设计 / 索引规范](#6)
7. [面试连环追问（10 条纵深链 + 完整答案）](#7)
8. [金句速记卡](#8)

---

<a id="1"></a>
## 1. 为什么需要这一章（痛点场景推演）

先不讲概念，先看一个真实事故。

**场景**：电商订单系统，订单表 `order` 5000 万行。某天运营做一次大促活动，用户下单后查询"我的订单"，页面加载 **8 秒**。监控显示 MySQL CPU 飙到 95%，连接池打满，下游服务全线超时。

**排查结果**：DBA 看了一眼慢日志，发现这条 SQL 跑了 6 秒：

```sql
SELECT * FROM `order` WHERE merchant_id = 10086 ORDER BY created_at DESC LIMIT 100000, 20;
```

**问题链**：
1. `merchant_id` 没建索引 → **全表扫描** 5000 万行
2. `SELECT *` → 把不需要的 30 个字段全读出来，**回表** 100020 次（每次回表都是一次随机 IO）
3. `LIMIT 100000, 20` → 深度分页，MySQL 要先扫前 100020 行再丢弃
4. 大促并发 200 QPS × 6s/条 = 同时 1200 条慢查询，连接池（默认 151）瞬间打满 → 全站雪崩

**根因**：开发者**不懂索引原理**。他知道"加索引能快"，但不知道为什么快、什么时候失效、回表代价多大。这就是为什么面试官一定要刨 B+ 树原理——**这不是八股，这是判断你有没有处理过线上事故的试金石**。

> 🔑 这章学完，你要能回答："给一张 5000 万行的订单表，怎么保证查询在 50ms 内？"——这才是技术总监该有的判断力。

---

<a id="2"></a>
## 2. 存储引擎：InnoDB vs MyISAM 一句话决策

**一句话**：**生产用 InnoDB（5.5 起默认），不用 MyISAM。**

| 维度 | InnoDB（In-Memory Database Engine，引擎名，无全拼，IBM 工程师命名） | MyISAM |
|------|------|--------|
| 事务 | ✅ 支持 ACID | ❌ 不支持 |
| 锁粒度 | **行锁**（高并发） | 表锁（并发差） |
| 外键 | ✅ | ❌ |
| 崩溃恢复 | ✅ redo log | ❌ 易损坏 |
| 聚簇索引 | ✅（数据和主键索引存一起）| ❌（索引和数据分离）|
| 全文索引 | 5.6+ 支持（一般用 ES 替代）| 支持 |

**面试一句话**：> 🔑 "MySQL 5.5 起默认 InnoDB，因为它支持事务 + 行锁 + 崩溃恢复，是 OLTP（Online Transaction Processing，联机事务处理）场景的唯一选择。MyISAM 只在'只读统计表'这种无事务需求的老系统里还能见到。"

---

<a id="3"></a>
## 3. 索引原理：B+ 树为什么是 B+ 树

### 3.1 为什么不用 B 树 / 红黑树 / 跳表 / Hash

这是面试官**最爱问的对比题**，必须能讲清每个"为什么不"。

**核心矛盾**：磁盘 IO 是性能瓶颈。MySQL 数据存磁盘，一次磁盘 IO 读一页（page，**16KB**）。索引的目标是**让树尽量矮**，减少磁盘 IO 次数。

**逐个排除**：

| 候选 | 为什么不行 |
|------|-----------|
| **Hash** | O(1) 查询确实快，但**不支持范围查询**（`WHERE id > 100` 全失效）、不支持排序。只能用于等值查询（如 Redis、Memory 引擎）。MySQL 的 `HASH INDEX` 仅在 Memory 引擎和自适应哈希索引（AHI）用 |
| **二叉搜索树 / AVL / 红黑树** | 二叉树每个节点最多 2 个子节点 → 5000 万行数据树高 **25 层+**（log₂(5×10⁷) ≈ 25.5）→ 25 次磁盘 IO。**太高了** |
| **B 树**（B-Tree，不是 B 减树）| 每个节点**都存数据**→ 一个 16KB 页放不下太多键 → fanout（扇出，每节点子节点数）小 → 树还是偏高；且范围查询要中序遍历多次回溯，没 B+ 树的叶子链表高效 |
| **跳表**（Skip List，Redis 用）| 查询效率 O(log N) 和 B+ 树相当，但**每个节点存一份数据**，内存占用比 B+ 树的"非叶子只存键"大；且 Redis 是纯内存，没有"按页读磁盘"的诉求 |

**B+ 树胜出的三个理由**（必须背）：
1. **非叶子节点只存键，不存数据** → 一个 16KB 页能放上千个键 → fanout 极大 → **3 层就能撑 2000 万行**
2. **叶子节点存数据 + 双向链表** → 范围查询顺着链表走，O(log N + K)
3. **查询稳定** → 数据都在叶子，每次查询都从根走到叶子，IO 次数恒定（3 层 = 3 次 IO）

---

### 3.2 B+ 树结构详解（画图）

```
                          ┌─────────────────────────┐
                          │     根节点(非叶子)       │
                          │   [10 | 20 | 30 | 40]   │  ← 只存键(订单ID)，不存数据
                          └──┬─────┬─────┬─────┬────┘
                             /     |     |     \
                  ┌──────────┘     |     |     └──────────┐
                  ▼                ▼     ▼                ▼
        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
        │  叶子1        │  │  叶子2        │  │  叶子3        │  │  叶子4        │
        │ [1,5,10]      │⇄│ [15,20]       │⇄│ [25,30]       │⇄│ [35,40]       │
        │ +完整行数据    │  │ +完整行数据    │  │ +完整行数据    │  │ +完整行数据    │
        └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
                              ↑ 双向链表 ↑                      ↑ 双向链表 ↑
         (范围查询的基础：WHERE id BETWEEN 15 AND 35 顺着链表扫 2→3)
```

**这幅图的关键点**（面试官会指着图问）：
- **根/中间节点**：每个节点是一个 16KB 的页，里面只放键（order_id）+ 指向子节点的指针。
- **叶子节点**：存**完整的行数据**（聚簇索引下）+ 指向前后的指针（双向链表）。
- **三层能存多少行**：
  - 根节点 16KB，假设一个键 + 指针 = 12 字节 → 能放 ~1365 个键 → fanout = 1365
  - 中间层 1365 个节点，每个又指向 1365 个叶子 → 叶子总数 = 1365² ≈ 186 万
  - 每个叶子假设放 10-15 行（行大小 1-1.5KB）→ **186 万 × 10 ≈ 1860 万行**
  - 这就是为什么常说"3 层 B+ 树存 2000 万行"

> 🔑 金句：B+ 树是为磁盘而生——**非叶子只存键让 fanout 极大、叶子双向链表让范围查询 O(log N+K)、3 层撑 2000 万行**。所有"为什么不用 X 树"的问题，本质都是在比较这三个维度。

---

### 3.3 聚簇索引 vs 二级索引（回表是面试核心）

**这是面试官区分"背了概念"还是"真懂原理"的分水岭。**

#### 聚簇索引（Clustered Index）

**定义**：叶子节点**存完整行数据**的索引。一张表**只能有一个**（因为数据只能按一种方式物理排序）。

**InnoDB 的聚簇索引 = 主键**。如果你没显式建主键，InnoDB 会：
1. 选第一个所有列都 NOT NULL 的 UNIQUE 索引
2. 都没有 → **生成一个隐藏的 6 字节 ROWID** 作为聚簇索引

```
聚簇索引(主键 order_id):
        [10000 | 20000 | 30000]              ← 非叶子(只存主键)
        /        |         \
  叶子[5000-9999] [叶子10000-19999] [叶子20000-29999]
       ↓ 存完整行
  {order_id:10000, user_id:88, amount:299, status:'PAID', ...}
```

#### 二级索引（Secondary Index，又叫非聚簇索引/辅助索引）

**定义**：叶子节点**不存行数据，存「索引键 + 主键值」**。查到主键后，还要**回表**到聚簇索引里拿完整行。

```
二级索引(merchant_id 上的普通索引):
        [100 | 200 | 300]                    ← 非叶子(只存 merchant_id)
        /       |        \
  叶子[1-99]  [叶子100-199]  [叶子200-299]
       ↓ 存的是
  {merchant_id:100, order_id:10086}          ← 只存 merchant_id + 主键 order_id
                                              ↑ 拿到 order_id 还要去聚簇索引回表!
```

**回表（Bookmark Lookup）完整流程**：

```
SELECT * FROM `order` WHERE merchant_id = 100;
                │
                ▼
  ① 走 merchant_id 二级索引树(3层) → 3次IO → 拿到 order_id=10086
                │
                ▼
  ② 拿 order_id=10086 回聚簇索引树(3层) → 3次IO → 拿到完整行
                │
                ▼
  合计 6 次 IO（比直接走主键多一倍）
```

**这就是为什么 `SELECT *` 慢**——每个匹配行都要回表一次。如果返回 1000 行，就是 1000 次随机回表 IO。

#### 覆盖索引（Covering Index）：避免回表的杀手锏

**定义**：如果查询的列**全部被某个索引覆盖**，就不用回表。

```sql
-- 建联合索引 idx_merchant_status(merchant_id, status)

-- ❌ 需要回表（要 SELECT *，索引里没有 amount 列）
SELECT * FROM `order` WHERE merchant_id = 100;

-- ✅ 覆盖索引（SELECT 的列都在索引里，直接返回，不回表）
SELECT merchant_id, status FROM `order` WHERE merchant_id = 100;
```

**EXPLAIN 里怎么识别覆盖索引**：`Extra` 列出现 **`Using index`** = 覆盖索引（好）；出现 **`Using index condition`** = 索引下推 ICP（次好）；出现 **`Using filesort` / `Using temporary`** = 坏（要优化）。

> 🔑 金句：**聚簇索引叶子存全行（一张表一个，就是主键）；二级索引叶子存「键+主键」，查完要回表；覆盖索引让查询不回表，是高性能 SQL 的第一招。**

---

### 3.4 覆盖索引 / 索引下推 ICP / 最左前缀

#### 最左前缀法则（高频考点，面试必问）

联合索引 `INDEX(a, b, c)` 的 B+ 树是**先按 a 排序，a 相同按 b，b 相同按 c**。所以：

```sql
INDEX(a, b, c)

-- ✅ 完全命中
WHERE a = 1                          -- 用 a
WHERE a = 1 AND b = 2                -- 用 a, b
WHERE a = 1 AND b = 2 AND c = 3      -- 用 a, b, c

-- ⚠️ 部分命中（只能用到 a）
WHERE a = 1 AND c = 3                -- 只用 a（c 用不到，中间断了 b）

-- ❌ 完全不命中（违反最左前缀）
WHERE b = 2                          -- 不用索引
WHERE c = 3                          -- 不用索引
WHERE b = 2 AND c = 3                -- 不用索引

-- ⚠️ 范围之后断（范围查询后的列用不到索引）
WHERE a = 1 AND b > 5 AND c = 3      -- 只用 a, b（b 是范围，c 用不到!）
-- 因为范围查询后，b 的顺序不再保证 c 有序
```

**为什么范围之后断**：联合索引是"先按 a 排，a 相同按 b 排"。`b > 5` 之后，满足条件的 b 值有 6,7,8...，每个 b 对应的 c 是**乱序**的，没法用 c 的索引有序性二分查找。

**口诀**：> 🔑 **"带头大哥不能死，中间兄弟不能断，范围之后全失效。"**

#### 索引下推 ICP（Index Condition Pushdown，5.6+）

**痛点**：联合索引 `INDEX(name, age)`，查询 `WHERE name LIKE '张%' AND age > 18`。
- 没有 ICP：MySQL 用 name 索引找到所有"张X"（比如 1000 个）→ **全部回表** → 在回表后用 age 过滤
- 有 ICP：在 name 索引层就**先用 age > 18 过滤**（索引里有 age）→ 只回表剩下的几十个

```
无 ICP:  索引层(1000个张X) → 回表1000次 → 过滤剩50个
有 ICP:  索引层(1000个张X → 先用age过滤剩50个) → 只回表50次   ← 少回表950次!
```

**EXPLAIN 识别**：`Extra: Using index condition`。

---

### 3.5 索引失效的 12 种场景（面试官爱问"什么时候索引不生效"）

| # | 场景 | 例子 | 原因 |
|:-:|------|------|------|
| 1 | 函数操作索引列 | `WHERE YEAR(created_at) = 2024` | 索引存的是原值，函数后变成新值，索引失效 |
| 2 | 隐式类型转换 | `WHERE order_no = 20240701001`（order_no 是 varchar） | MySQL 给列加了 `CAST(order_no AS INT)`，等于函数操作 |
| 3 | 运算操作 | `WHERE id + 1 = 100` | 同上，应写成 `WHERE id = 99` |
| 4 | 模糊查询左模糊 | `WHERE name LIKE '%三'` | B+ 树按前缀排序，左模糊没法二分 |
| 5 | `OR` 连接非索引列 | `WHERE a = 1 OR b = 2`（b 没索引）| 优化器发现要全表扫 b，干脆全表扫 |
| 6 | `!=` / `<>` / `NOT IN` | `WHERE status != 'PAID'` | 否定条件优化器估算"命中行太多"，放弃索引 |
| 7 | `IS NOT NULL` | — | 同上（NULL 值多的列优化器放弃） |
| 8 | 联合索引违反最左前缀 | 见 3.4 | 非叶子节点找不到入口 |
| 9 | 范围之后断 | 见 3.4 | 联合索引有序性被破坏 |
| 10 | 优化器选错（统计信息陈旧） | 索引存在但 `EXPLAIN` 显示 type=ALL | `ANALYZE TABLE` 更新统计信息 |
| 11 | 字符集不一致（JOIN 时） | `utf8mb4` JOIN `utf8` | 隐式转换失效 |
| 12 | 数据量太小 | 表就 100 行 | 优化器直接全表扫更快 |

> 🔑 **诊断口诀**：遇到"建了索引却没用"→ 优先怀疑前 4 个（函数/类型转换/运算/左模糊），这是 90% 的失效原因。

---

<a id="4"></a>
## 4. 事务：ACID / 隔离级别 / MVCC / 锁

### 4.1 ACID 四特性谁保谁

| 特性 | 全拼 | 含义 | 谁保证 |
|------|------|------|--------|
| **A** 原子性 | Atomicity | 事务要么全做要么全不做 | **undo log**（回滚日志）|
| **C** 一致性 | Consistency | 事务前后数据合法 | A + I + D + 业务约束共同保证 |
| **I** 隔离性 | Isolation | 并发事务互不干扰 | **MVCC + 锁** |
| **D** 持久性 | Durability | 提交后永久 | **redo log**（重做日志）|

**口诀**：> 🔑 **A 靠 undo 回滚，D 靠 redo 落盘，I 靠 MVCC+锁，C 是前三加业务约束的结果。**

---

### 4.2 四种隔离级别 + 三现象（⚠️ 这是面试重灾区，错题本 SQL-01 你"说反"过）

#### 三现象（必须背对，不能说反！）

| 现象 | 定义 | 业务例子 |
|------|------|----------|
| **脏读 Dirty Read** | 读到别的事务**未提交**的修改 | 事务A把订单状态改成 PAID 但还没 COMMIT，事务B 读到 PAID 就开始发货；A 回滚了，B 已经发了不该发的货 |
| **不可重复读 Non-Repeatable Read** | **同一行**两次读结果**不同**（别的事务 UPDATE 并 COMMIT 了）| 事务B 第一次查订单金额是 299，事务A 把它改成 199 并提交，B 第二次查变成 199——同一行变了 |
| **幻读 Phantom Read** | **同一范围**两次查**条数不同**（别的事务 INSERT/DELETE 了）| 事务B 第一次 `COUNT(*) WHERE status='PAID'` 是 100 条，事务A 新插入 10 条 PAID 并提交，B 再查变 110——多了"幻影行" |

**记忆诀窍**（别再说反）：
- **脏读**：读了**没提交**的（脏 = 来路不明）
- **不可重复读**：**同一行**变了（UPDATE 引起，改内容）
- **幻读**：**行数**变了（INSERT/DELETE 引起，改数量）

#### 四种隔离级别（MySQL 默认 RR，必须知道！）

| 隔离级别 | 脏读 | 不可重复读 | 幻读 | 备注 |
|----------|:----:|:--------:|:----:|------|
| READ UNCOMMITTED（读未提交）| ✅ 会发生 | ✅ | ✅ | 几乎不用 |
| READ COMMITTED（读已提交，**RC**）| ❌ | ✅ | ✅ | **Oracle / PostgreSQL 默认** |
| **REPEATABLE READ（可重复读，RR）**| ❌ | ❌ | ✅⚠️ | **MySQL 默认**；但 InnoDB 用 MVCC+间隙锁**解决了幻读** |
| SERIALIZABLE（串行化）| ❌ | ❌ | ❌ | 性能极差，不用 |

**⚠️ 关键细节**：SQL 标准说 RR 会有幻读，但 **InnoDB 的 RR 用 Next-Key Lock（临键锁）解决了幻读**——这是 MySQL 比 SQL 标准更严格的地方。面试官常追问"MySQL 的 RR 和标准 RR 有什么不同"，答这个。

#### ⚠️ 错题 SQL-01 纠错点（你已经"说反"过一次，这次必须记死）

```
你之前的错误答案：脏读=同行变、不可重复读=行数变   ← 完全反了!

正确：
  脏读          = 读到【未提交】的数据
  不可重复读    = 同一行【内容】变了（UPDATE）
  幻读          = 范围内【行数】变了（INSERT/DELETE）
```

---

### 4.3 MVCC 原理：ReadView + undo 版本链（高频深挖）

**MVCC（Multi-Version Concurrency Control，多版本并发控制）** 是 MySQL 实现 RC/RR 隔离级别的核心。一句话：**读不加锁，靠版本链读到历史快照**。

#### 为什么需要 MVCC

没有 MVCC 的世界：读和写互斥。事务A 更新某行时，事务B 想读这行就得**等 A 提交**（行锁阻塞）。高并发下性能崩盘。

MVCC 的思路：**读不阻塞写、写不阻塞读**——读操作去看这行的"历史快照版本"，写操作正常加锁改当前版本。

#### 三要素

**① 每行隐藏三个字段**（InnoDB 自动加）：
```
order 表每行实际结构:
┌──────────────────────────────────────────────────────────┐
│ order_id | user_id | amount | ... | DB_TRX_ID | DB_ROLL_PTR | DB_ROW_ID │
│          |         |        |     | (事务ID)  | (回滚指针)  | (隐藏主键)│
└──────────────────────────────────────────────────────────┘
  - DB_TRX_ID: 最后修改这行的事务ID
  - DB_ROLL_PTR: 指向 undo log 里的上一个版本
```

**② undo log 版本链**（trx_id 小 = 老版本）：
```
当前行:    {amount:199, trx_id:300}  ← 最新(事务300刚改的)
              ↑ roll_ptr
undo版本1: {amount:299, trx_id:200}  ← 事务200改的版本
              ↑ roll_ptr
undo版本2: {amount:399, trx_id:100}  ← 最初版本
```
顺着 roll_ptr 往下走，能拿到这条记录的所有历史版本——这就是"版本链"。

**③ ReadView（读视图）**——决定当前事务能看到哪个版本：

事务开启时生成一个 ReadView，里面记录 4 个值：
- `m_ids`：当前**所有未提交事务的 ID 列表**
- `min_trx_id`：m_ids 里最小的
- `max_trx_id`：下一个要分配的事务 ID（系统全局）
- `creator_trx_id`：当前事务自己的 ID

#### 可见性判断算法（核心，面试常问）

拿着版本链上每个版本的 `trx_id`，按这个规则判断：

```
版本 trx_id = T

情况1: T == creator_trx_id    → 可见（自己改的自己能看）
情况2: T < min_trx_id         → 可见（这个版本在 ReadView 生成前就提交了）
情况3: T >= max_trx_id        → 不可见（ReadView 之后才开启的事务改的）
情况4: min_trx_id <= T < max_trx_id
       ├─ T 在 m_ids 里       → 不可见（这事务还没提交）
       └─ T 不在 m_ids 里     → 可见（已提交）
```

如果当前版本不可见，就顺着 `roll_ptr` 找上一个版本，直到找到一个可见的为止。

#### RC vs RR 的根本区别（就一行）

| 隔离级别 | ReadView 生成时机 | 效果 |
|----------|------------------|------|
| **RC** | **每条 SELECT** 都生成新 ReadView | 每次读都能看到最新已提交数据 → 不可重复读 |
| **RR** | **事务第一次 SELECT** 生成，全程复用 | 整个事务看同一快照 → 可重复读 |

> 🔑 金句：**MVCC = 隐藏列(trx_id) + undo 版本链 + ReadView。RC 每次读生成新视图（所以不可重复读），RR 全程用一个视图（所以可重复读）。读不加锁，是靠"看哪个版本"实现的。**

---

### 4.4 三大日志：redo / undo / binlog + 两阶段提交（面试高频组合题）

#### 三大日志职责对比

| 日志 | 层级 | 类型 | 作用 | 谁写 |
|------|------|------|------|------|
| **redo log** | InnoDB 引擎层 | 物理日志（记"某页某偏移改成什么"）| **崩溃恢复**（保持久性 D）| InnoDB |
| **undo log** | InnoDB 引擎层 | 逻辑日志（记"反向操作"）| **事务回滚**（保原子性 A）+ **MVCC 版本链** | InnoDB |
| **binlog** | Server 层 | 逻辑日志（记"SQL 或行变更"）| **主从复制** + **数据恢复**（ PITR，Point-in-Time Recovery）| Server |

**WAL（Write-Ahead Logging，预写式日志）**：MySQL 先写 redo log（顺序写，快），再慢慢把内存（Buffer Pool）的脏页刷盘（随机写，慢）。这样即使崩溃，靠 redo log 就能恢复。

#### 为什么有两阶段提交（Two-Phase Commit，2PC）

**痛点**：redo log（引擎层）和 binlog（Server 层）是两个独立的日志。如果先写 redo 后崩溃，binlog 没写 → 从库用 binlog 同步，会丢这条变更 → **主从不一致**。

**两阶段提交流程**（必须能画）：

```
事务 COMMIT
   │
   ▼
① 写 redo log（prepare 状态）    ← 阶段1：准备
   │
   ▼
② 写 binlog
   │
   ▼
③ 写 redo log（commit 状态）     ← 阶段2：提交
   │
   ▼
返回客户端"提交成功"
```

**崩溃恢复规则**：
- 重启后扫 redo log，发现某事务是 `prepare` 状态（没到 commit）→ 检查对应的 binlog **有没有完整写完**：
  - binlog 完整 → 认为已提交，补写 redo commit（保证从库能同步）
  - binlog 不完整 → **回滚**（保证主库数据一致）

> 🔑 金句：**两阶段提交是为了让 redo log 和 binlog 保持一致——崩溃时靠'binlog 有没有写完'来决定是提交还是回滚，这样主从数据才不会丢。**

---

### 4.5 锁全家桶：行锁/间隙锁/Next-Key/意向锁/MDL

#### 锁粒度层级

```
表锁                                    ← 粒度大，并发低
  ├─ MDL（Meta Data Lock，元数据锁）    ← DDL(建表/改表) 和 DML 互斥
  └─ 意向锁（IS/IX）                    ← 表级"我要加行锁"的快速声明
      └─ 行锁（InnoDB 核心）            ← 粒度小，并发高
          ├─ 记录锁 Record Lock         ← 锁单行
          ├─ 间隙锁 Gap Lock            ← 锁两行之间的间隙(防INSERT)
          └─ 临键锁 Next-Key Lock       ← Record + 前间隙(RR默认,防幻读)
```

#### 共享锁 vs 排他锁（基础）

| 锁 | 语法 | 兼容 |
|----|------|------|
| **S 锁（共享锁，读锁）** | `SELECT ... LOCK IN SHARE MODE` | S 和 S 兼容（可同时读）|
| **X 锁（排他锁，写锁）** | `SELECT ... FOR UPDATE` / `UPDATE` / `DELETE` | X 和任何锁互斥 |

#### 三种行锁详解（RR 防幻读的关键）

假设表里有 order_id = 10, 20, 30 三行：

```
记录锁 Record Lock:
  SELECT ... WHERE order_id = 20 FOR UPDATE
  → 只锁 order_id=20 这一行

间隙锁 Gap Lock:
  SELECT ... WHERE order_id BETWEEN 15 AND 25 FOR UPDATE
  → 锁住 (10, 20) 和 (20, 30) 之间的间隙
  → 别的事务不能 INSERT order_id=15/18/25（防幻读）

临键锁 Next-Key Lock（= Record + 前间隙）:
  SELECT ... WHERE order_id = 20 FOR UPDATE  (RR级别)
  → 锁住 (10, 20] 这个左开右闭区间
  → 既能防改(锁20)又能防插(锁10-20间隙)
```

**RR 防幻读的原理**：RR 级别下，范围查询会用 Next-Key Lock 锁住整个范围 + 间隙，别的事务无法在这个范围内 INSERT，所以两次范围查条数不变。

#### ⚠️ 行锁基于索引（致命坑，错题本生词本都提过）

> InnoDB 行锁是**基于索引**实现的。**如果 WHERE 没走索引（全表扫），行锁会退化为表锁！**

```sql
-- order_no 是唯一索引
SELECT * FROM `order` WHERE order_no = 'NO20240701001' FOR UPDATE;  -- ✅ 行锁

-- merchant_id 没索引
SELECT * FROM `order` WHERE merchant_id = 100 FOR UPDATE;  -- ⚠️ 退化为表锁！整张表锁死
```

**资金类场景必须注意**：所有 `FOR UPDATE` 的条件列**必须有索引**，否则锁全表，高并发直接死锁。

#### 意向锁（IS/IX）

**作用**：表级"快速声明"，避免逐行检查是否有人加行锁。

```
事务A:  对某行加 X 锁(行锁)  → 先在表上加 IX(意向排他锁,表级)
事务B:  想给整张表加表锁(S锁)
        → 检查表上有没有 IX → 有 → 互斥，等待
        → 不用逐行扫"有没有人锁了某行"
```

#### 死锁排查

```sql
-- 看最近一次死锁详情
SHOW ENGINE INNODB STATUS\G
-- 找到 "LATEST DETECTED DEADLOCK" 段，看两个事务各持有什么锁、等什么锁

-- 看当前正在等待的事务
SELECT * FROM information_schema.INNODB_TRX;
SELECT * FROM performance_schema.data_locks;        -- 8.0+
SELECT * FROM performance_schema.data_lock_waits;   -- 8.0+
```

> 🔑 金句：**InnoDB 行锁基于索引，没索引就退化为表锁（资金场景大坑）；RR 用 Next-Key Lock（行锁+前间隙）防幻读；意向锁是表级快速声明，免得逐行查锁。**

---

<a id="5"></a>
## 5. 性能优化：EXPLAIN 全字段 + 慢 SQL 排查链

### 5.1 EXPLAIN 全字段（面试官会让你逐字段讲）

```sql
EXPLAIN SELECT * FROM `order` WHERE merchant_id = 100 AND status = 'PAID';
```

输出 12 列，重点掌握这些：

| 列 | 含义 | 怎么看（好坏）|
|----|------|--------------|
| **id** | 查询序号 | id 相同从上往下执行；id 不同，大的先执行（子查询）|
| **select_type** | 查询类型 | SIMPLE（简单查询，好）/ PRIMARY / SUBQUERY / DERIVED |
| **table** | 表名 | — |
| **type** ⭐ | **访问类型（最重要）** | **从好到差**：`system > const > eq_ref > ref > range > index > ALL`。**底线：range 以上，绝不能 ALL**（全表扫）|
| **possible_keys** | 可能用到的索引 | NULL = 没索引可用 |
| **key** ⭐ | **实际用的索引** | NULL = 没走索引！|
| **key_len** | 索引使用长度 | 联合索引用了几列（看是否用满）|
| **ref** | 索引比较来源 | const / 列名 |
| **rows** ⭐ | **估算扫描行数** | 越小越好 |
| **filtered** | 过滤后剩余比例 | 100 = 没过滤；1 = 扫10000留100（要加索引）|
| **Extra** ⭐ | **额外信息（关键）** | `Using index`=覆盖索引(好)；`Using index condition`=ICP(次好)；`Using where`=回表后过滤；`Using filesort`=额外排序(⚠️)；`Using temporary`=临时表(⚠️⚠️) |

**type 详解**（必须背）：
- `const`：主键或唯一索引等值查询，最多 1 行（最快）
- `eq_ref`：JOIN 时被驱动表用主键/唯一索引，最多 1 行
- `ref`：普通索引等值查询
- `range`：范围查询（`>`, `<`, `BETWEEN`, `IN`）
- `index`：扫描整个索引树（比 ALL 好点，但仍是全扫）
- `ALL`：全表扫描（**红灯，必须优化**）

### 5.2 慢 SQL 排查链（工业级流程）

```
① 开启慢日志（长期开，设阈值 1s）
   slow_query_log = ON
   long_query_time = 1

② mysqldumpslow 分析 TOP 慢 SQL
   mysqldumpslow -s t -t 10 /var/log/mysql/slow.log
   → 按耗时排序取前10条

③ EXPLAIN 单条 SQL
   - 看 type（有没有 ALL）
   - 看 key（有没有走索引）
   - 看 rows（扫描了多少行）
   - 看 Extra（有没有 filesort/temporary）

④ 优化三板斧
   a. 加索引（遵循最左前缀，避免失效场景）
   b. 改写 SQL（SELECT * → 指定列；深度分页用游标；避免大 IN）
   c. 改架构（读写分离 / 分库分表 / 加缓存）
```

### 5.3 深度分页优化（高频面试题）

```sql
-- ❌ 慢：LIMIT 100000, 20 要先扫前100020行
SELECT * FROM `order` ORDER BY id LIMIT 100000, 20;

-- ✅ 子查询+覆盖索引：先用索引查id，再JOIN
SELECT * FROM `order` o
INNER JOIN (SELECT id FROM `order` ORDER BY id LIMIT 100000, 20) t
ON o.id = t.id;

-- ✅✅ 记住上次最大id（最佳，但要前端配合传游标）
SELECT * FROM `order` WHERE id > #{last_id} ORDER BY id LIMIT 20;
```

---

<a id="6"></a>
## 6. 工业级落地：生产参数 / 表设计 / 索引规范

### 6.1 生产核心参数（`my.cnf`）

```ini
[mysqld]
# 内存（按机器内存调，这里是 16G 服务器）
innodb_buffer_pool_size = 10G          # Buffer Pool，给物理内存的 60-70%（最关键参数）
innodb_buffer_pool_instances = 8        # 多实例减少锁竞争（≥1G 时生效）

# 日志
innodb_log_file_size = 1G               # redo log 单文件大小（大→减少 checkpoint 抖动）
innodb_log_buffer_size = 64M
innodb_flush_log_at_trx_commit = 1      # 1=每次提交刷盘(最安全) / 2=刷OS缓存(秒级丢) / 0=每秒刷(丢1秒)
sync_binlog = 1                          # 1=每次提交刷binlog盘(主从安全) / 0=OS 管(性能高)

# 连接
max_connections = 500                    # 按业务调，别用默认151
wait_timeout = 28800

# 慢日志
slow_query_log = ON
long_query_time = 1
log_queries_not_using_indexes = ON       # 记录没用索引的查询（开发环境开，生产慎用）

# 隔离级别
transaction_isolation = REPEATABLE-READ  # 生产默认 RR
```

### 6.2 表设计规范（阿里规约 + 实战）

```sql
-- ❌ 反例
CREATE TABLE `order` (
  id INT,                                -- ❌ 用 INT，5000万行会溢出；应 BIGINT
  order_no VARCHAR(32),                  -- ❌ 没指定 NOT NULL / 没默认值
  amount DOUBLE,                         -- ❌ 浮点数精度丢失！必须 DECIMAL
  status VARCHAR(20),                    -- ❌ 状态用 VARCHAR，应用 TINYINT + 枚举
  created_at DATETIME,                   -- ❌ 应加 DEFAULT CURRENT_TIMESTAMP
  INDEX idx_status(status),              -- ❌ 区分度低的列（status就几个值）不该单独建索引
  INDEX idx_created(created_at)          -- ❌ 单列索引，应该和 merchant_id 联合
);

-- ✅ 正例
CREATE TABLE `order` (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  order_no VARCHAR(32) NOT NULL DEFAULT '' COMMENT '订单号(业务唯一)',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  merchant_id INT UNSIGNED NOT NULL COMMENT '商户ID',
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '金额(分避免浮点)',
  status TINYINT NOT NULL DEFAULT 0 COMMENT '状态:0待支付1已支付2已发货3已完成',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_no (order_no),
  KEY idx_user_created (user_id, created_at),           -- 用户查订单(高频)
  KEY idx_merchant_status (merchant_id, status)         -- 商户查订单(高频)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单表';
```

**核心规范**：
1. 主键用 BIGINT UNSIGNED AUTO_INCREMENT（或雪花 ID），别用 INT（21亿溢出）
2. 金额用 `DECIMAL(10,2)`，绝不用 FLOAT/DOUBLE（精度丢失，资金事故源头）
3. 状态用 TINYINT + 枚举注释，不用 VARCHAR
4. 字段 NOT NULL + 默认值（NULL 处理麻烦、索引统计不准）
5. 字符集 `utf8mb4`（支持 emoji，utf8 是阉割版只支持 3 字节）
6. 索引区分度：`COUNT(DISTINCT col)/COUNT(*) > 0.3` 才值得单独建索引
7. 联合索引顺序：等值列在前、范围列在后、排序列在后

### 6.3 索引规范（实战口诀）

| 原则 | 说明 |
|------|------|
| 单表索引 ≤ 5 个 | 索引多了拖慢写入（每次 INSERT/UPDATE 都要维护所有索引树）|
| 联合索引列数 ≤ 5 | 太长 key_len 大、维护贵 |
| 区分度低的列不单独建索引 | status（3个值）单独索引没用，应进联合索引 |
| 优先覆盖索引 | 把高频查询的 SELECT 列都塞进联合索引 |
| 建索引前 EXPLAIN 验证 | 别凭感觉加，用 EXPLAIN 确认真的能走 |

---

<a id="7"></a>
## 7. 面试连环追问（10 条纵深链 + 完整答案）

> 每条追问链模拟面试官从概念→机理→实现→生产坑的层层刨问。先把上面原理看懂，再来这里验证。

### 追问链 1：为什么 MySQL 用 B+ 树不用 B 树

- **Q1：MySQL 索引用什么数据结构？** → B+ 树。
- **Q2：为什么不用 B 树？** → B 树非叶子节点也存数据，一个 16KB 页放不下太多键，fanout 小，树偏高；且 B 树范围查询要中序遍历回溯，没 B+ 树的叶子链表高效。
- **Q3：为什么不用红黑树？** → 二叉树高 log₂(N)，5000万行要 25 层，磁盘 IO 次数太多。B+ 树 fanout 大，3 层就够。
- **Q4：为什么不用 Hash 索引？** → Hash O(1) 等值查询快，但不支持范围查询和排序。InnoDB 主索引用 B+ 树，但有**自适应哈希索引（AHI）**自动把热点数据建哈希加速。
- **Q5：3 层 B+ 树能存多少行？怎么算？** → ~2000万行。根节点16KB÷12字节≈1365键，中间层1365²≈186万叶子，每叶子10-15行 → 1860万。

### 追问链 2：聚簇索引 vs 二级索引 + 回表

- **Q1：聚簇索引和二级索引有什么区别？** → 聚簇叶子存全行（一张表一个，就是主键）；二级叶子存「索引键+主键」，查完要回表。
- **Q2：回表是什么？代价？** → 拿主键再去聚簇索引查完整行，多一次 IO。返回N行就N次回表。
- **Q3：怎么避免回表？** → 覆盖索引，让 SELECT 的列都在索引里，EXPLAIN 看 `Using index`。
- **Q4：没建主键会怎样？** → InnoDB 选第一个全 NOT NULL 的 UNIQUE 索引；都没有就生成隐藏 6 字节 ROWID。
- **Q5：为什么主键建议自增 BIGINT？** → 自增保证新数据顺序追加到 B+ 树末尾（避免页分裂）；BIGINT 不会溢出。用 UUID 做主键会导致随机插入，频繁页分裂，写性能差。

### 追问链 3：最左前缀 + 索引下推

- **Q1：联合索引 `(a,b,c)`，`WHERE a=1 AND c=3` 命中吗？** → 只命中 a，c 用不到（中间断了 b）。
- **Q2：`WHERE a=1 AND b>5 AND c=3` 呢？** → 命中 a,b；b 是范围，范围之后断，c 用不到。
- **Q3：为什么范围之后断？** → 联合索引先按 a 排序，a 相同按 b。`b>5` 后满足的 b 有多个，每个 b 对应的 c 乱序，没法用 c 的有序性。
- **Q4：索引下推 ICP 是什么？** → 5.6+ 特性，在索引层就先过滤（联合索引里有后续列），减少回表次数。EXPLAIN 看 `Using index condition`。
- **Q5：ICP 之前的流程？** → 没索引下推时，索引找到所有满足前缀的行，全部回表，再过滤。比如 name LIKE '张%' 有1000个，全回表再用 age 过滤；有 ICP 在索引层先过滤 age，只回表几十个。

### 追问链 4：索引失效场景

- **Q1：建了索引却没用，有哪些原因？** → 函数操作、隐式类型转换、运算、左模糊、OR 非索引列、!=/NOT IN、最左前缀违反。
- **Q2：`WHERE YEAR(created_at)=2024` 为什么失效？** → 索引存原值，YEAR() 后是新值，等于给列加了函数。应改成 `WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01'`。
- **Q3：`WHERE order_no = 20240701001`（order_no 是 varchar）为什么失效？** → MySQL 给列加了 CAST 转 INT，等于函数操作。应传字符串 `'20240701001'`。
- **Q4：怎么诊断？** → EXPLAIN 看 type/key/Extra。type=ALL + key=NULL = 全表扫。统计信息陈旧用 `ANALYZE TABLE` 更新。

### 追问链 5：事务隔离级别 + 三现象（⚠️ 你说反过，重点练）

- **Q1：MySQL 有哪几种隔离级别？默认是哪个？** → 读未提交/读已提交/可重复读/串行化。**默认 RR（可重复读）**。
- **Q2：脏读、不可重复读、幻读分别是什么？** →
  - 脏读：读到**未提交**的修改
  - 不可重复读：**同一行**两次读内容不同（UPDATE 引起）
  - 幻读：**同一范围**两次查行数不同（INSERT/DELETE 引起）
- **Q3：MySQL 的 RR 解决幻读了吗？** → 解决了。用 MVCC（快照读）+ Next-Key Lock（当前读）。
- **Q4：RC 和 RR 在 MVCC 上有什么区别？** → RC 每次 SELECT 生成新 ReadView（所以不可重复读）；RR 全程用一个 ReadView（所以可重复读）。
- **Q5：Oracle 默认哪个？为什么 MySQL 选 RR？** → Oracle 默认 RC。MySQL 选 RR 是因为早期 binlog 是 statement 格式，RC 下主从复制会有问题（现在 row 格式没这问题，但 RR 成了传统）。

### 追问链 6：MVCC 实现

- **Q1：MVCC 是什么？** → 多版本并发控制，读不加锁靠版本链读历史快照，实现读写不阻塞。
- **Q2：怎么实现的？** → 每行隐藏 trx_id + roll_ptr；undo log 存历史版本形成版本链；ReadView 记录活跃事务列表，按可见性算法选版本。
- **Q3：ReadView 的可见性规则？** → 版本 trx_id 小于 min_trx_id 可见；大于等于 max_trx_id 不可见；在 m_ids 里不可见，不在可见；等于自己可见。
- **Q4：当前读和快照读区别？** → 快照读（普通 SELECT）读 MVCC 版本不加锁；当前读（UPDATE/DELETE/SELECT...FOR UPDATE）读最新版本并加锁。
- **Q5：为什么 RR 下第一次 SELECT 后，后续都看不到新提交的数据？** → RR 的 ReadView 在第一次 SELECT 时生成，全程复用，新事务的 trx_id >= 当时 max_trx_id，不可见。

### 追问链 7：三大日志 + 两阶段提交

- **Q1：redo/undo/binlog 各干什么？** → redo 保持久（崩溃恢复）；undo 保原子（回滚）+ MVCC 版本链；binlog 保主从复制 + PITR。
- **Q2：什么是 WAL？** → Write-Ahead Logging，先写 redo log（顺序写快），再异步刷脏页（随机写慢），崩溃靠 redo 恢复。
- **Q3：为什么有两阶段提交？** → 保证 redo log 和 binlog 一致。崩溃时靠 binlog 有没有写完决定提交还是回滚，避免主从不一致。
- **Q4：`innodb_flush_log_at_trx_commit=1` 和 `sync_binlog=1` 是双1配置吗？** → 是，这是最安全的配置（每次提交都刷盘），生产必须这么配（金融场景）。
- **Q5：redo log 是物理日志，binlog 是逻辑日志，区别？** → 物理：记"某页某偏移改成X"；逻辑：记"SQL 语句"或"行变更事件（row 格式）"。物理恢复快（直接覆盖），逻辑跨引擎（binlog 可给 PG 用）。

### 追问链 8：锁机制

- **Q1：InnoDB 有哪些锁？** → 表级（MDL/意向锁）+ 行级（记录锁/间隙锁/Next-Key）。
- **Q2：行锁基于什么实现？** → 基于索引。WHERE 没走索引 → 退化为表锁（大坑）。
- **Q3：Next-Key Lock 怎么防幻读？** → 锁住行 + 前间隙，别的 INSERT 进不来，范围查条数不变。
- **Q4：意向锁的作用？** → 表级快速声明"我要加行锁"，避免逐行检查。事务加行锁前先加 IX，别的表锁请求看到 IX 就知道有行锁，直接互斥。
- **Q5：怎么排查死锁？** → `SHOW ENGINE INNODB STATUS\G` 看 LATEST DETECTED DEADLOCK 段；`SELECT * FROM performance_schema.data_lock_waits` 看等待关系。

### 追问链 9：性能优化

- **Q1：一条慢 SQL 怎么排查？** → EXPLAIN 看 type（有没有 ALL）、key（走没走索引）、rows（扫了多少行）、Extra（filesort/temporary）；慢日志定位 TOP；mysqldumpslow 聚合。
- **Q2：深度分页 `LIMIT 100000, 20` 为什么慢？怎么优化？** → 要扫前100020行丢弃。优化：①子查询+覆盖索引先查id再JOIN ②游标分页 `WHERE id > last_id LIMIT 20`。
- **Q3：索引建多了好不好？** → 不好。写多场景索引多了拖慢写入（每次 INSERT/UPDATE 维护所有索引树）；占空间。单表建议 ≤5 个。
- **Q4：`SELECT *` 有什么问题？** → ①无法用覆盖索引（强制回表）②传不需要的列浪费网络带宽 ③表结构变了影响。应明确指定列。
- **Q5：怎么判断该不该加索引？** → 看区分度（`COUNT(DISTINCT col)/COUNT(*) > 0.3`）+ 查询频率。低区分度列进联合索引，不单独建。

### 追问链 10：架构级（技术总监/架构师岗）

- **Q1：MySQL 单表数据多少要分库分表？** → 经验值单表 1000-5000 万行、单库 100GB 左右考虑。但先做读写分离 + 索引优化，到瓶颈再分。
- **Q2：分片键怎么选？** → 按最高频查询路径选（订单按 user_id，90%查询是用户看自己订单）。order_id 内嵌 user_id 基因法反解路由。
- **Q3：读写分离怎么解决"主从延迟导致的读到旧数据"？** → ①强制读主（关键业务）②Redis 标记"刚写过"读主 + TTL 监控延迟 ③半同步复制（主库等至少一个从库收到 binlog 才返回）。
- **Q4：MySQL 高可用方案？** → MHA（Master High Availability，故障自动切主）/ Orchestrator / Group Replication（MGR，Paxos）/ 云 RDS。
- **Q5：什么时候选 MySQL 什么时候选 NoSQL？** → 强事务/复杂关联/结构稳定用 MySQL；海量低价值数据（日志/时序）用 ES/TDengine；灵活 schema 用 MongoDB；缓存用 Redis。别用 MySQL 硬扛不适用的场景。

---

<a id="8"></a>
## 8. 金句速记卡（面试直接用）

> 🔑 **索引**：B+ 树为磁盘而生——非叶子只存键让 fanout 极大、叶子双向链表让范围查询 O(log N+K)、3 层撑 2000 万行。

> 🔑 **聚簇vs二级**：聚簇叶子存全行（一张表一个，就是主键）；二级叶子存「键+主键」，查完要回表；覆盖索引让查询不回表。

> 🔑 **最左前缀**：带头大哥不能死，中间兄弟不能断，范围之后全失效。

> 🔑 **三现象（别说反）**：脏读=读未提交；不可重复读=同行变（UPDATE）；幻读=行数变（INSERT）。

> 🔑 **隔离级别**：MySQL 默认 RR，用 MVCC（快照读）+ Next-Key Lock（当前读）把幻读也解决了，比 SQL 标准更严格。

> 🔑 **MVCC**：隐藏列 trx_id + undo 版本链 + ReadView。RC 每次读生成新视图，RR 全程用一个。

> 🔑 **三大日志**：redo 保持久、undo 保原子+MVCC、binlog 保主从；两阶段提交让 redo 和 binlog 一致。

> 🔑 **行锁**：基于索引实现，没索引退化为表锁（资金场景大坑）；RR 用 Next-Key Lock 防幻读。

> 🔑 **EXPLAIN 底线**：type 必须 range 以上（绝不能 ALL）；Extra 出现 Using index 最好，出现 filesort/temporary 要优化。

> 🔑 **慢 SQL 三板斧**：加索引（最左前缀+避免失效）→ 改写 SQL（别 SELECT *、游标分页）→ 改架构（读写分离/分库分表/缓存）。

---

<a id="9"></a>
## 9. MySQL 5.7 vs 8.0 核心区别（高频面试题）

> 这题是面试官判断你"有没有跟上版本"的试金石。8.0 是 2018 年发布的 LTS（Long-Term Support，长期支持版本），现在生产主流是 8.0，**5.7 已于 2023-10 EOL（End of Life，停止官方支持）**，新项目不该再用。

### 9.1 一张图看懂核心差异

```
┌─────────────────── MySQL 5.7 ───────────────────┐   ┌──────────────── MySQL 8.0 ────────────────┐
│                                                  │   │                                            │
│  ● 默认认证插件 mysql_native_password            │   │  ● 默认 caching_sha2_password（更安全）     │
│  ● 无窗口函数                                    │   │  ● 语法级窗口函数 OVER()                    │
│  ● 无 CTE / 递归                                 │   │  ● CTE + 递归 WITH RECURSIVE                │
│  ● UTF8MB4 → UTF8MB3(默认utf8)                  │   │  ● 默认 utf8mb4（真正的4字节）               │
│  ● 自增主键 REPEATABLE-READ 下断号可复用          │   │  ● 自增主键持久化（断号不复用）              │
│  ● 隐藏列靠约定                                  │   │  ● 隐藏列 / 不可见索引（INVISIBLE）          │
│  ● DDL 原生 INSTANT 只有部分                     │   │  ● 8.0.12+ DDL INSTANT（秒级改大表）         │
│  ● 字典存在 .frm 文件                            │   │  ● 事务型数据字典（InnoDB 存元数据）          │
│  ● 无角色（Role）                                │   │  ● 角色管理 CREATE ROLE                      │
│  ● 无 JSON 表函数                                │   │  ● JSON_TABLE() / JSON 聚合                  │
│  ● 复制：单线程 / 并行基于库                     │   │  ● 复制：WRITESET 并行（跨库也能并行）        │
│  ● 优化器 Hint 弱                                │   │  ● 优化器 Hint 完备                          │
│                                                  │   │                                            │
└──────────────────────────────────────────────────┘   └────────────────────────────────────────────┘
```

**一句话决策**：> 🔑 "5.7 已 EOL（2023-10），生产新项目必选 8.0；8.0 的窗口函数、CTE、DDL INSTANT、WRITESET 并行复制、事务字典是把开发体验和生产能力拉开代差的五件事。"

---

### 9.2 SQL 能力增强（最直接影响你写代码）

#### A. 窗口函数（Window Function）—— 最大体验提升

**痛点**：5.7 想算"每个用户金额最高的 3 笔订单"（分组 TopN），得用变量（`@rn := @rn + 1`）写丑陋 hack。

**8.0 写法**：
```sql
-- 每个用户金额最高的 3 笔订单
SELECT * FROM (
  SELECT
    order_id, user_id, amount,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY amount DESC) AS rn
  FROM `order`
) t
WHERE rn <= 3;
```

**窗口函数全家桶**（必须背）：

| 函数 | 作用 | 业务例子 |
|------|------|----------|
| `ROW_NUMBER()` | 行号（不并列）| 给订单按金额排名 1,2,3 |
| `RANK()` | 排名（并列跳号）| 并列第1，下一个是第3 |
| `DENSE_RANK()` | 排名（并列不跳）| 并列第1，下一个是第2 |
| `LAG(col, n)` | 取前 n 行的值 | 算订单环比（本次 − 上次金额）|
| `LEAD(col, n)` | 取后 n 行 | 算下次购买时间间隔 |
| `SUM/AVG OVER` | 累计/滑动聚合 | 累计 GMV、7 日滑动均值 |

**执行机制**：`OVER(PARTITION BY x ORDER BY y)` 不会 GROUP BY 合并行，而是**对每个分组内的每行计算**，结果附在新列。执行顺序：FROM → WHERE → GROUP BY → HAVING → **窗口函数** → SELECT → ORDER BY → LIMIT。

> 🔑 **窗口函数 = "不合并行的分组聚合"**。PARTITION BY 分组但行数不变，ORDER BY 决定排序，ROWS BETWEEN 定义窗口范围（滑动窗口）。

#### B. CTE（Common Table Expression，通用表表达式）+ 递归

**痛点**：5.7 写子查询嵌套三层就读不动；查组织树/评论树只能存过程或应用层递归。

**8.0 写法**：
```sql
-- 普通 CTE：给子查询起名，可复用
WITH recent_orders AS (
  SELECT * FROM `order` WHERE created_at >= '2026-08-01'
)
SELECT user_id, COUNT(*) FROM recent_orders GROUP BY user_id;

-- 递归 CTE：查组织树（所有下属）
WITH RECURSIVE subordinates AS (
  SELECT id, name, parent_id FROM org WHERE id = 1         -- 锚点：根节点
  UNION ALL
  SELECT o.id, o.name, o.parent_id
  FROM org o JOIN subordinates s ON o.parent_id = s.id      -- 递归：找下一层
)
SELECT * FROM subordinates;
```

**递归 CTE 执行机制**：
```
① 锚点查询（base case）→ 得到根节点 {1}
② 把 {1} 作为输入 JOIN 表，得到子节点 {2,3}
③ 把 {2,3} 作为输入 JOIN 表，得到孙节点 {4,5,6}
④ 没有新数据产生 → 终止
⑤ UNION ALL 把每层结果拼起来
```

**防死循环**：设 `cte_max_recursion_depth = 100`（默认 1000），超过抛错。

#### C. JSON 增强

```sql
-- 8.0 新增：JSON_TABLE 把 JSON 数组炸成行（5.7 做不到）
SELECT * FROM JSON_TABLE(
  '[{"user":"张三","amount":299},{"user":"李四","amount":199}]',
  '$[*]' COLUMNS (
    user   VARCHAR(50) PATH '$.user',
    amount DECIMAL(10,2) PATH '$.amount'
  )
) AS jt;

-- 8.0 新增：JSON 聚合
SELECT JSON_OBJECT('user_id', user_id, 'total', SUM(amount)) FROM `order` GROUP BY user_id;
SELECT JSON_ARRAYAGG(order_id) FROM `order` WHERE user_id = 88;  -- 把多行 order_id 聚成 JSON 数组
```

---

### 9.3 性能与运维增强（架构师重点）

#### A. DDL INSTANT（8.0.12+，改大表秒级完成）

**痛点**：5.7 给亿级表加列 / 加索引，要么长时间锁表，要么用 gh-ost/pt-online-schema-change 这类第三方工具（复杂）。

**8.0 INSTANT 算法**：
```
5.7:  COPY（全表复制，锁表）→ INPLACE（不复制数据，但 metadata 锁）
8.0:  INPLACE → INSTANT（只改元数据，0 秒，不锁表不扫数据）
```

**INSTANT 能做什么**（8.0.12）：
- ✅ 加列（默认加到末尾）
- ✅ 删除列（8.0.29+）
- ✅ 重命名列
- ❌ 加索引不能 INSTANT（要走 INPLACE）

**怎么看用没用 INSTANT**：
```sql
ALTER TABLE `order` ADD COLUMN remark VARCHAR(100), ALGORITHM=INSTANT;
-- SHOW 查看行数不变、瞬间完成
```

> 🔑 **INSTANT 的本质**：只改数据字典（元数据），不动数据行。代价是"加的列默认在末尾，且物理顺序和查询顺序可能不一致"——但用户无感知。

#### B. WRITESET 并行复制（从库延迟终结者）

**痛点**：5.7 主从复制从库是**单线程回放**或**按库并行**（没分库就串行）。大促主库 5万 TPS，从库追不上，延迟几小时。

**5.7 vs 8.0 复制并行度**：
```
5.7:  按库并行（DATABASE 级别）→ 一个库的事务只能串行，分了10个库才10倍并行
8.0:  WRITESET 并行（基于行冲突）→ 只要两个事务改不同的行，就能并行回放

      事务A: UPDATE order SET ... WHERE id=1     ┐
      事务B: UPDATE order SET ... WHERE id=2     ├─ 不冲突，8.0 从库并行回放
      事务C: UPDATE order SET ... WHERE id=3     ┘
```

**配置**（8.0 从库）：
```ini
binlog_transaction_dependency_tracking = WRITESET   # 主库：用 WRITESET 算依赖
slave_parallel_type = LOGICAL_CLOCK                 # 从库：基于 group 并行
slave_parallel_workers = 16                          # 从库：并行 worker 数
```

#### C. 事务型数据字典（告别 .frm 文件）

**5.7**：表结构存在 `.frm` 文件里（文件系统层），改表结构要动文件，难原子化、难分布式。

**8.0**：表结构、索引、列定义全部存到 InnoDB 表里（`mysql.tables` 等），**DDL 本身变成事务**，崩溃不损坏元数据。这是 8.0 能做 INSTANT DDL 的地基。

#### D. 自增主键持久化（5.7 的坑被填了）

**5.7 的坑**：重启 MySQL 后，自增主键的"下一个值"会重置为 `MAX(id)+1`。
```
-- 5.7 场景：
INSERT 到 id=100 → DELETE id=90~100 → 重启 MySQL
→ INSERT 新行 → id=90（复用了删掉的！）   ← 断号"复活"，可能撞上旧外键引用
```

**8.0**：自增值持久化到数据字典，重启不复位，**断号永久不复用**。金融场景这个改动很重要——避免"已删除的订单号突然又出现"。

---

### 9.4 安全与认证增强

#### A. 默认认证插件变更（升级第一坑！）

```
5.7 默认:  mysql_native_password（SHA1 哈希，弱）
8.0 默认:  caching_sha2_password（SHA-256 + 缓存，强）
```

**升级踩坑现场**：5.7 升 8.0 后，老应用连不上，报错：
```
Client does not support authentication protocol requested by server;
consider upgrading MySQL client
```

**解法三选一**：
```sql
-- 方案1：给老账号单独降级认证（过渡期用）
ALTER USER 'app_user'@'%' IDENTIFIED WITH mysql_native_password BY 'pwd';

-- 方案2：升级客户端驱动（MySQ Connector/J 8.0+ / JDBC 8+），长期方案
-- 方案3：全局改回旧认证（不推荐，安全降级）
[mysqld]
default_authentication_plugin = mysql_native_password
```

> 🔑 **坑预警**：方案1 在 8.0 还能用，但 `caching_sha2_password` 是趋势，新项目直接用 + 客户端升级，别为了兼容老客户端降安全。

#### B. 角色管理（Role）

**5.7**：权限直接授予用户，DBA 要给"运营角色"的 20 个账号逐个授 SELECT 权限，离职逐个回收。

**8.0**：
```sql
CREATE ROLE role_ops_readonly;                           -- 定义角色
GRANT SELECT ON analytics.* TO role_ops_readonly;        -- 给角色授权
GRANT role_ops_readonly TO user_a, user_b, user_c;       -- 把角色赋给用户
-- 离职：REVOKE role_ops_readonly FROM user_c;           -- 一句话回收
```

#### C. 不可见索引（Invisible Index）—— DBA 调优利器

```sql
-- 怀疑某索引没用，想删但怕删错？8.0 可以先隐藏
ALTER TABLE `order` ALTER INDEX idx_xxx INVISIBLE;
-- 优化器当它不存在（查询不走它），但索引数据还在
-- 观察 N 天没问题 → 真删：DROP INDEX idx_xxx
-- 出问题 → 恢复：ALTER INDEX idx_xxx VISIBLE（秒级，不用重建）
```

**用途**：安全地"试删索引"，避免 5.7 时代删了发现有用又要重建几小时的尴尬。

---

### 9.5 升级 5.7 → 8.0 注意事项（实战）

| 维度 | 检查项 | 动作 |
|------|--------|------|
| **认证插件** | 老应用是否用旧驱动 | 升级 JDBC 到 8.0+，或过渡期用 mysql_native_password |
| **保留字** | 8.0 新增保留字（`RANK`/`GROUPS`/`SYSTEM`）| 若表名/列名撞了，加反引号 |
| **字符集** | 5.7 默认 utf8 = utf8mb3；8.0 默认 utf8mb4 | 升级后新表自动 utf8mb4；老表 `ALTER TABLE CONVERT TO CHARACTER SET utf8mb4` |
| **SQL Mode** | `ONLY_FULL_GROUP_BY` 在 8.0 强制更严 | 检查 GROUP BY 查询的 SELECT 列 |
| **排序行为** | 5.7 ORDER BY 在无索引时排序结果不稳定 | 8.0 更严格，必须显式加唯一列保证稳定 |
| **InnoDB 字典** | .frm 文件不再需要 | 升级时自动迁移，别手动删 .frm |
| **复制兼容** | 从库是 8.0、主库 5.7 可以；反过来不行 | 滚动升级时先升从库再切主 |

**升级步骤（滚动升级，不停机）**：
```
① 从库先升 8.0（主从可异构，5.7 主 → 8.0 从 OK）
② 验证从库回放正常（看 Seconds_Behind_Master）
③ 切主：原主降从，新主 8.0
④ 原主升 8.0，重新挂成从库
⑤ 全部 8.0 后，开启 WRITESET 并行复制 + caching_sha2_password
```

---

### 9.6 面试连环追问（5 条纵深链）

- **Q1：MySQL 5.7 和 8.0 最核心的三个区别？** → ①窗口函数/CTE（SQL 能力）②DDL INSTANT（运维）③WRITESET 并行复制（性能）。再加默认 utf8mb4 + caching_sha2_password。
- **Q2：窗口函数和 GROUP BY 有什么区别？** → GROUP BY 把 N 行聚合成 1 行；窗口函数对每行计算但**行数不变**，结果附在新列。
- **Q3：什么是 WRITESET 并行复制？解决了什么问题？** → 5.7 按库并行，单库事务串行；8.0 用 WRITESET 分析"哪些事务改了不同的行"，不冲突就并行回放。解决从库延迟。
- **Q4：8.0 升级最大的坑是什么？** → 认证插件从 mysql_native_password 变 caching_sha2_password，老客户端连不上。解法：升级 JDBC 驱动 / 过渡期给老账号降级认证。
- **Q5：什么是 INSTANT DDL？为什么能做到秒级？** → 8.0.12+ 引入，只改数据字典（元数据）不动数据行，所以秒级。能做加列/删列/改名，不能做加索引。
- **Q6（深挖）：5.7 升 8.0，自增主键行为有什么变化？为什么？** → 5.7 重启后自增计数器重置为 MAX(id)+1，断号会复用；8.0 持久化到数据字典，重启不复位。原因是 5.7 计数器在内存里，8.0 写到事务型数据字典。
- **Q7（架构师深挖）：你们生产怎么滚动升级 5.7 → 8.0 不停机？** → 先升从库（5.7主→8.0从兼容）→ 验证回放 → 切主 → 原主升级挂回从库。升级后再开 WRITESET 并行。

---

### 9.7 金句速记卡

> 🔑 **版本决策**：5.7 已 EOL（2023-10），生产新项目必选 8.0；区别记五个关键词——窗口函数、CTE、INSTANT DDL、WRITESET 复制、caching_sha2。

> 🔑 **窗口函数**：不合并行的分组聚合（PARTITION BY 分组但行数不变）；GROUP BY 是 N→1，窗口函数是 N→N。

> 🔑 **升级第一坑**：认证插件变了，老驱动连不上——升级 JDBC 到 8.0+ 或过渡期给老账号降级认证。

> 🔑 **INSTANT DDL**：只改元数据不碰数据行，秒级加列；地基是 8.0 的事务型数据字典（元数据存 InnoDB 表）。

> 🔑 **WRITESET 并行**：从库按"行冲突"判断能否并行，不冲突就并行回放；终结了 5.7 时代"单库事务串行"的从库延迟。

---

## 落盘说明

- **本文档**：`docs/技术详解-MySQL索引事务锁.md`（独立深度教材，可 `/study review` 复用）
- **关联错题**：`docs/错题本.md` SQL-01（B+树漏叶子链表/聚簇二级错配/三现象说反）
- **关联图谱**：`docs/岗位能力图谱-严格版.md` 2.4 漏洞表 `backend.mysql`（当前 40 分，目标 60+）
- **学习记录**：`docs/学习记录.md` 第 25 条（🟠 学习中，检测后补评分）
- **下一步**：知识检测（8-10 题）→ 模拟面试（3-5 轮）→ 评分更新 → 错题归档
