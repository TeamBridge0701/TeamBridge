-- 채팅 데이터

USE groupware;

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



-- =====================================================
-- [이번 추가 데이터] 부서별 그룹 채팅방
-- 기존 채팅 데이터 INSERT는 그대로 유지
-- =====================================================
START TRANSACTION;

-- 사번으로 직원 ID를 찾아 개발 환경마다 AUTO_INCREMENT 값이 달라도 같은 데이터를 연결한다.
SET @devLeadId := (SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260102');
SET @devDeputyId := (SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260301');
SET @devStaffId := (SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260601');

SET @hrLeadId := (SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260202');
SET @hrDeputyId := (SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260203');
SET @hrStaffId := (SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260205');

SET @salesLeadId := (SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260312');
SET @salesDeputyId := (SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260313');
SET @salesStaffId := (SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260315');

SET @financeLeadId := (SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260402');
SET @financeDeputyId := (SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260403');
SET @financeStaffId := (SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260405');

-- 개발팀 그룹방: 방·참여자·시스템 메시지·일반 메시지를 각각 중복 없이 추가한다.
INSERT INTO CHAT_ROOM (ROOM_TYPE, ROOM_NAME)
SELECT 'GROUP', '[테스트] 개발팀 스프린트'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_ROOM
    WHERE ROOM_TYPE = 'GROUP'
      AND ROOM_NAME = '[테스트] 개발팀 스프린트'
);

SET @devRoomId := (
    SELECT ROOM_ID FROM CHAT_ROOM
    WHERE ROOM_TYPE = 'GROUP'
      AND ROOM_NAME = '[테스트] 개발팀 스프린트'
    LIMIT 1
);

INSERT INTO CHAT_ROOM_MEMBER (ROOM_ID, EMPLOYEE_ID)
SELECT @devRoomId, e.EMPLOYEE_ID
FROM EMPLOYEE e
WHERE e.EMPLOYEE_NO IN ('20260102', '20260301', '20260601')
  AND NOT EXISTS (
      SELECT 1 FROM CHAT_ROOM_MEMBER m
      WHERE m.ROOM_ID = @devRoomId
        AND m.EMPLOYEE_ID = e.EMPLOYEE_ID
  );

INSERT INTO CHAT_MESSAGE (ROOM_ID, SENDER_ID, MESSAGE_TYPE, CONTENT)
SELECT @devRoomId, NULL, 'SYSTEM', '개발팀 스프린트 채팅방이 생성되었습니다.'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_MESSAGE
    WHERE ROOM_ID = @devRoomId
      AND CONTENT = '개발팀 스프린트 채팅방이 생성되었습니다.'
);

INSERT INTO CHAT_MESSAGE (ROOM_ID, SENDER_ID, MESSAGE_TYPE, CONTENT)
SELECT @devRoomId, @devLeadId, 'TEXT', '이번 스프린트 우선순위를 공유드립니다.'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_MESSAGE
    WHERE ROOM_ID = @devRoomId
      AND CONTENT = '이번 스프린트 우선순위를 공유드립니다.'
);

-- 인사팀 그룹방: 방·참여자·시스템 메시지·일반 메시지를 각각 중복 없이 추가한다.
INSERT INTO CHAT_ROOM (ROOM_TYPE, ROOM_NAME)
SELECT 'GROUP', '[테스트] 인사팀 채용 회의'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_ROOM
    WHERE ROOM_TYPE = 'GROUP'
      AND ROOM_NAME = '[테스트] 인사팀 채용 회의'
);

SET @hrRoomId := (
    SELECT ROOM_ID FROM CHAT_ROOM
    WHERE ROOM_TYPE = 'GROUP'
      AND ROOM_NAME = '[테스트] 인사팀 채용 회의'
    LIMIT 1
);

INSERT INTO CHAT_ROOM_MEMBER (ROOM_ID, EMPLOYEE_ID)
SELECT @hrRoomId, e.EMPLOYEE_ID
FROM EMPLOYEE e
WHERE e.EMPLOYEE_NO IN ('20260202', '20260203', '20260205')
  AND NOT EXISTS (
      SELECT 1 FROM CHAT_ROOM_MEMBER m
      WHERE m.ROOM_ID = @hrRoomId
        AND m.EMPLOYEE_ID = e.EMPLOYEE_ID
  );

INSERT INTO CHAT_MESSAGE (ROOM_ID, SENDER_ID, MESSAGE_TYPE, CONTENT)
SELECT @hrRoomId, NULL, 'SYSTEM', '인사팀 채용 회의 채팅방이 생성되었습니다.'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_MESSAGE
    WHERE ROOM_ID = @hrRoomId
      AND CONTENT = '인사팀 채용 회의 채팅방이 생성되었습니다.'
);

INSERT INTO CHAT_MESSAGE (ROOM_ID, SENDER_ID, MESSAGE_TYPE, CONTENT)
SELECT @hrRoomId, @hrDeputyId, 'TEXT', '면접 대상자 일정표를 확인해 주세요.'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_MESSAGE
    WHERE ROOM_ID = @hrRoomId
      AND CONTENT = '면접 대상자 일정표를 확인해 주세요.'
);

-- 영업팀 그룹방: 방·참여자·시스템 메시지·일반 메시지를 각각 중복 없이 추가한다.
INSERT INTO CHAT_ROOM (ROOM_TYPE, ROOM_NAME)
SELECT 'GROUP', '[테스트] 영업팀 주간 실적'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_ROOM
    WHERE ROOM_TYPE = 'GROUP'
      AND ROOM_NAME = '[테스트] 영업팀 주간 실적'
);

SET @salesRoomId := (
    SELECT ROOM_ID FROM CHAT_ROOM
    WHERE ROOM_TYPE = 'GROUP'
      AND ROOM_NAME = '[테스트] 영업팀 주간 실적'
    LIMIT 1
);

INSERT INTO CHAT_ROOM_MEMBER (ROOM_ID, EMPLOYEE_ID)
SELECT @salesRoomId, e.EMPLOYEE_ID
FROM EMPLOYEE e
WHERE e.EMPLOYEE_NO IN ('20260312', '20260313', '20260315')
  AND NOT EXISTS (
      SELECT 1 FROM CHAT_ROOM_MEMBER m
      WHERE m.ROOM_ID = @salesRoomId
        AND m.EMPLOYEE_ID = e.EMPLOYEE_ID
  );

INSERT INTO CHAT_MESSAGE (ROOM_ID, SENDER_ID, MESSAGE_TYPE, CONTENT)
SELECT @salesRoomId, NULL, 'SYSTEM', '영업팀 주간 실적 채팅방이 생성되었습니다.'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_MESSAGE
    WHERE ROOM_ID = @salesRoomId
      AND CONTENT = '영업팀 주간 실적 채팅방이 생성되었습니다.'
);

INSERT INTO CHAT_MESSAGE (ROOM_ID, SENDER_ID, MESSAGE_TYPE, CONTENT)
SELECT @salesRoomId, @salesLeadId, 'TEXT', '이번 주 고객사 미팅 결과를 정리해 주세요.'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_MESSAGE
    WHERE ROOM_ID = @salesRoomId
      AND CONTENT = '이번 주 고객사 미팅 결과를 정리해 주세요.'
);

-- 재무관리팀 그룹방: 방·참여자·시스템 메시지·일반 메시지를 각각 중복 없이 추가한다.
INSERT INTO CHAT_ROOM (ROOM_TYPE, ROOM_NAME)
SELECT 'GROUP', '[테스트] 재무관리팀 월 마감'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_ROOM
    WHERE ROOM_TYPE = 'GROUP'
      AND ROOM_NAME = '[테스트] 재무관리팀 월 마감'
);

SET @financeRoomId := (
    SELECT ROOM_ID FROM CHAT_ROOM
    WHERE ROOM_TYPE = 'GROUP'
      AND ROOM_NAME = '[테스트] 재무관리팀 월 마감'
    LIMIT 1
);

INSERT INTO CHAT_ROOM_MEMBER (ROOM_ID, EMPLOYEE_ID)
SELECT @financeRoomId, e.EMPLOYEE_ID
FROM EMPLOYEE e
WHERE e.EMPLOYEE_NO IN ('20260402', '20260403', '20260405')
  AND NOT EXISTS (
      SELECT 1 FROM CHAT_ROOM_MEMBER m
      WHERE m.ROOM_ID = @financeRoomId
        AND m.EMPLOYEE_ID = e.EMPLOYEE_ID
  );

INSERT INTO CHAT_MESSAGE (ROOM_ID, SENDER_ID, MESSAGE_TYPE, CONTENT)
SELECT @financeRoomId, NULL, 'SYSTEM', '재무관리팀 월 마감 채팅방이 생성되었습니다.'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_MESSAGE
    WHERE ROOM_ID = @financeRoomId
      AND CONTENT = '재무관리팀 월 마감 채팅방이 생성되었습니다.'
);

INSERT INTO CHAT_MESSAGE (ROOM_ID, SENDER_ID, MESSAGE_TYPE, CONTENT)
SELECT @financeRoomId, @financeStaffId, 'TEXT', '지출결의서 증빙 자료 검토를 완료했습니다.'
WHERE NOT EXISTS (
    SELECT 1 FROM CHAT_MESSAGE
    WHERE ROOM_ID = @financeRoomId
      AND CONTENT = '지출결의서 증빙 자료 검토를 완료했습니다.'
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
