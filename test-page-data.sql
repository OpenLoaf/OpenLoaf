-- 1. 插入测试Tag数据
INSERT INTO Tag (id, name, color, createdAt, workspaceId) VALUES 
("tag-ecommerce", "电商", "#FF6B6B", datetime("now"), "4b70de76-268f-4a7a-9664-41732a4924dc"),
("tag-task", "任务", "#4ECDC4", datetime("now"), "4b70de76-268f-4a7a-9664-41732a4924dc"),
("tag-event", "活动", "#FFE66D", datetime("now"), "4b70de76-268f-4a7a-9664-41732a4924dc"),
("tag-film", "影视", "#1A535C", datetime("now"), "4b70de76-268f-4a7a-9664-41732a4924dc"),
("tag-software", "软件", "#9B5DE5", datetime("now"), "4b70de76-268f-4a7a-9664-41732a4924dc"),
("tag-note", "笔记", "#00BBF9", datetime("now"), "4b70de76-268f-4a7a-9664-41732a4924dc");

-- 2. 插入测试Page数据 - 5个不同类型的项目
-- 注意：tags字段现在存储的是Tag表的id数组
INSERT INTO Page (id, title, icon, cover, isExpanded, createdAt, updatedAt, parentId, tags, workspaceId) VALUES 
-- 1. 电商类型项目
("page-ecommerce", "电商平台项目", "🛒", "https://example.com/ecommerce-cover.jpg", true, datetime("now"), datetime("now"), NULL, '["tag-ecommerce"]', "4b70de76-268f-4a7a-9664-41732a4924dc"),
-- 电商项目任务1
("page-ecommerce-task1", "产品列表开发", "📋", NULL, false, datetime("now"), datetime("now"), "page-ecommerce", '["tag-task"]', "4b70de76-268f-4a7a-9664-41732a4924dc"),
-- 电商项目任务2
("page-ecommerce-task2", "支付系统集成", "💳", NULL, false, datetime("now"), datetime("now"), "page-ecommerce", '["tag-task"]', "4b70de76-268f-4a7a-9664-41732a4924dc"),

-- 2. 活动策划类型项目
("page-event", "年度发布会策划", "🎉", "https://example.com/event-cover.jpg", true, datetime("now"), datetime("now"), NULL, '["tag-event"]', "4b70de76-268f-4a7a-9664-41732a4924dc"),
-- 活动策划任务1
("page-event-task1", "嘉宾邀请", "📧", NULL, false, datetime("now"), datetime("now"), "page-event", '["tag-task"]', "4b70de76-268f-4a7a-9664-41732a4924dc"),
-- 活动策划任务2
("page-event-task2", "场地布置", "🏟️", NULL, false, datetime("now"), datetime("now"), "page-event", '["tag-task"]', "4b70de76-268f-4a7a-9664-41732a4924dc"),

-- 3. 影视项目类型项目
("page-film", "短视频制作", "🎬", "https://example.com/film-cover.jpg", true, datetime("now"), datetime("now"), NULL, '["tag-film"]', "4b70de76-268f-4a7a-9664-41732a4924dc"),
-- 影视项目任务1
("page-film-task1", "剧本编写", "✍️", NULL, false, datetime("now"), datetime("now"), "page-film", '["tag-task"]', "4b70de76-268f-4a7a-9664-41732a4924dc"),

-- 4. 软件开发类型项目
("page-software", "移动应用开发", "📱", "https://example.com/software-cover.jpg", true, datetime("now"), datetime("now"), NULL, '["tag-software"]', "4b70de76-268f-4a7a-9664-41732a4924dc"),
-- 软件开发任务1
("page-software-task1", "UI设计", "🎨", NULL, false, datetime("now"), datetime("now"), "page-software", '["tag-task"]', "4b70de76-268f-4a7a-9664-41732a4924dc"),
-- 软件开发任务2
("page-software-task2", "后端API开发", "🔌", NULL, false, datetime("now"), datetime("now"), "page-software", '["tag-task"]', "4b70de76-268f-4a7a-9664-41732a4924dc"),

-- 5. 个人笔记项目（无任务）
("page-note", "个人学习笔记", "📓", "https://example.com/note-cover.jpg", true, datetime("now"), datetime("now"), NULL, '["tag-note"]', "4b70de76-268f-4a7a-9664-41732a4924dc");

-- 查看插入结果
SELECT * FROM Tag;
SELECT * FROM Page;