------- 채팅 데이터 --------

START TRANSACTION;

-- 테스트에 사용할 실제 직원 ID 조회
SET @adminId := (
    SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = 'admin'
);
SET @kimId := (
    SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260010'
);
SET @leeId := (
    SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260102'
);
SET @parkId := (
    SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260601'
);


-- =====================================================
-- 개인방 1: 관리자 ↔ 김부장
-- =====================================================
SET @dmAdminKim := (
    SELECT r.ROOM_ID
    FROM CHAT_ROOM r
    JOIN CHAT_ROOM_MEMBER m ON m.ROOM_ID = r.ROOM_ID
    WHERE r.ROOM_TYPE = 'DM'
    GROUP BY r.ROOM_ID
    HAVING COUNT(*) = 2
       AND SUM(m.EMPLOYEE_ID = @adminId) = 1
       AND SUM(m.EMPLOYEE_ID = @kimId) = 1
    ORDER BY r.ROOM_ID DESC
    LIMIT 1
);

INSERT INTO CHAT_ROOM (ROOM_TYPE, ROOM_NAME)
SELECT 'DM', NULL
WHERE @dmAdminKim IS NULL;

SET @dmAdminKim := COALESCE(@dmAdminKim, LAST_INSERT_ID());

INSERT INTO CHAT_ROOM_MEMBER (ROOM_ID, EMPLOYEE_ID)
SELECT @dmAdminKim, e.EMPLOYEE_ID
FROM EMPLOYEE e
WHERE e.EMPLOYEE_NO IN ('admin', '20260010')
  AND NOT EXISTS (
      SELECT 1
      FROM CHAT_ROOM_MEMBER m
      WHERE m.ROOM_ID = @dmAdminKim
        AND m.EMPLOYEE_ID = e.EMPLOYEE_ID
  );

INSERT INTO CHAT_MESSAGE (ROOM_ID, SENDER_ID, MESSAGE_TYPE, CONTENT)
SELECT @dmAdminKim, @adminId, 'TEXT',
       '김부장님, 이번 주 개발 진행 상황 공유 부탁드립니다.'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_MESSAGE
    WHERE ROOM_ID = @dmAdminKim
      AND SENDER_ID = @adminId
      AND CONTENT = '김부장님, 이번 주 개발 진행 상황 공유 부탁드립니다.'
);

INSERT INTO CHAT_MESSAGE (ROOM_ID, SENDER_ID, MESSAGE_TYPE, CONTENT)
SELECT @dmAdminKim, @kimId, 'TEXT',
       '네, 오늘 오후에 진행 상황을 정리해서 보고드리겠습니다.'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_MESSAGE
    WHERE ROOM_ID = @dmAdminKim
      AND SENDER_ID = @kimId
      AND CONTENT = '네, 오늘 오후에 진행 상황을 정리해서 보고드리겠습니다.'
);


-- =====================================================
-- 개인방 2: 관리자 ↔ 이팀장
-- =====================================================
SET @dmAdminLee := (
    SELECT r.ROOM_ID
    FROM CHAT_ROOM r
    JOIN CHAT_ROOM_MEMBER m ON m.ROOM_ID = r.ROOM_ID
    WHERE r.ROOM_TYPE = 'DM'
    GROUP BY r.ROOM_ID
    HAVING COUNT(*) = 2
       AND SUM(m.EMPLOYEE_ID = @adminId) = 1
       AND SUM(m.EMPLOYEE_ID = @leeId) = 1
    ORDER BY r.ROOM_ID DESC
    LIMIT 1
);

INSERT INTO CHAT_ROOM (ROOM_TYPE, ROOM_NAME)
SELECT 'DM', NULL
WHERE @dmAdminLee IS NULL;

SET @dmAdminLee := COALESCE(@dmAdminLee, LAST_INSERT_ID());

INSERT INTO CHAT_ROOM_MEMBER (ROOM_ID, EMPLOYEE_ID)
SELECT @dmAdminLee, e.EMPLOYEE_ID
FROM EMPLOYEE e
WHERE e.EMPLOYEE_NO IN ('admin', '20260102')
  AND NOT EXISTS (
      SELECT 1
      FROM CHAT_ROOM_MEMBER m
      WHERE m.ROOM_ID = @dmAdminLee
        AND m.EMPLOYEE_ID = e.EMPLOYEE_ID
  );

INSERT INTO CHAT_MESSAGE (ROOM_ID, SENDER_ID, MESSAGE_TYPE, CONTENT)
SELECT @dmAdminLee, @leeId, 'TEXT',
       '관리자님, 다음 주 일정 관련하여 확인 요청드립니다.'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_MESSAGE
    WHERE ROOM_ID = @dmAdminLee
      AND SENDER_ID = @leeId
      AND CONTENT = '관리자님, 다음 주 일정 관련하여 확인 요청드립니다.'
);


-- =====================================================
-- 그룹방 1: 관리자 · 김부장 · 이팀장
-- =====================================================
SET @groupDev := (
    SELECT ROOM_ID
    FROM CHAT_ROOM
    WHERE ROOM_TYPE = 'GROUP'
      AND ROOM_NAME = '[테스트] 주간 개발 점검'
    LIMIT 1
);

INSERT INTO CHAT_ROOM (ROOM_TYPE, ROOM_NAME)
SELECT 'GROUP', '[테스트] 주간 개발 점검'
WHERE @groupDev IS NULL;

SET @groupDev := COALESCE(@groupDev, LAST_INSERT_ID());

INSERT INTO CHAT_ROOM_MEMBER (ROOM_ID, EMPLOYEE_ID)
SELECT @groupDev, e.EMPLOYEE_ID
FROM EMPLOYEE e
WHERE e.EMPLOYEE_NO IN ('admin', '20260010', '20260102')
  AND NOT EXISTS (
      SELECT 1
      FROM CHAT_ROOM_MEMBER m
      WHERE m.ROOM_ID = @groupDev
        AND m.EMPLOYEE_ID = e.EMPLOYEE_ID
  );

INSERT INTO CHAT_MESSAGE (ROOM_ID, SENDER_ID, MESSAGE_TYPE, CONTENT)
SELECT @groupDev, NULL, 'SYSTEM',
       '주간 개발 점검 채팅방이 생성되었습니다.'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_MESSAGE
    WHERE ROOM_ID = @groupDev
      AND SENDER_ID IS NULL
      AND CONTENT = '주간 개발 점검 채팅방이 생성되었습니다.'
);

INSERT INTO CHAT_MESSAGE (ROOM_ID, SENDER_ID, MESSAGE_TYPE, CONTENT)
SELECT @groupDev, @kimId, 'TEXT',
       '백엔드 기능 구현 현황을 공유드립니다.'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_MESSAGE
    WHERE ROOM_ID = @groupDev
      AND SENDER_ID = @kimId
      AND CONTENT = '백엔드 기능 구현 현황을 공유드립니다.'
);


-- =====================================================
-- 그룹방 2: 관리자 · 이팀장 · 박사원
-- =====================================================
SET @groupDesign := (
    SELECT ROOM_ID
    FROM CHAT_ROOM
    WHERE ROOM_TYPE = 'GROUP'
      AND ROOM_NAME = '[테스트] 화면 디자인 검토'
    LIMIT 1
);

INSERT INTO CHAT_ROOM (ROOM_TYPE, ROOM_NAME)
SELECT 'GROUP', '[테스트] 화면 디자인 검토'
WHERE @groupDesign IS NULL;

SET @groupDesign := COALESCE(@groupDesign, LAST_INSERT_ID());

INSERT INTO CHAT_ROOM_MEMBER (ROOM_ID, EMPLOYEE_ID)
SELECT @groupDesign, e.EMPLOYEE_ID
FROM EMPLOYEE e
WHERE e.EMPLOYEE_NO IN ('admin', '20260102', '20260601')
  AND NOT EXISTS (
      SELECT 1
      FROM CHAT_ROOM_MEMBER m
      WHERE m.ROOM_ID = @groupDesign
        AND m.EMPLOYEE_ID = e.EMPLOYEE_ID
  );

INSERT INTO CHAT_MESSAGE (ROOM_ID, SENDER_ID, MESSAGE_TYPE, CONTENT)
SELECT @groupDesign, NULL, 'SYSTEM',
       '화면 디자인 검토 채팅방이 생성되었습니다.'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_MESSAGE
    WHERE ROOM_ID = @groupDesign
      AND SENDER_ID IS NULL
      AND CONTENT = '화면 디자인 검토 채팅방이 생성되었습니다.'
);

INSERT INTO CHAT_MESSAGE (ROOM_ID, SENDER_ID, MESSAGE_TYPE, CONTENT)
SELECT @groupDesign, @parkId, 'TEXT',
       '메인 화면 시안을 1차로 정리했습니다.'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_MESSAGE
    WHERE ROOM_ID = @groupDesign
      AND SENDER_ID = @parkId
      AND CONTENT = '메인 화면 시안을 1차로 정리했습니다.'
);

COMMIT;


-- 관리자에게 보이는 테스트 방 확인
SELECT
    r.ROOM_ID,
    r.ROOM_TYPE,
    r.ROOM_NAME,
    (
        SELECT COUNT(*)
        FROM CHAT_MESSAGE cm
        WHERE cm.ROOM_ID = r.ROOM_ID
    ) AS MESSAGE_COUNT
FROM CHAT_ROOM r
JOIN CHAT_ROOM_MEMBER m
  ON m.ROOM_ID = r.ROOM_ID
WHERE m.EMPLOYEE_ID = @adminId
  AND r.ROOM_ID IN (
      @dmAdminKim,
      @dmAdminLee,
      @groupDev,
      @groupDesign
  )
ORDER BY r.ROOM_ID;