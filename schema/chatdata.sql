-- 개발/테스트용 CHAT 초기 데이터
-- 전제: 같은 폴더의 schema.sql, data.sql을 먼저 실행해 EMPLOYEE가 만들어져 있어야 함
-- 방 → 참여자 → 메시지 순서를 지켜 외래키 관계를 안전하게 생성함

USE groupware;

START TRANSACTION;

-- DM 테스트에 사용할 직원 ID를 사번으로 조회한다.
SET @adminId := (SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = 'admin');
SET @kimId := (SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260010');
SET @leeId := (SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260102');
SET @parkId := (SELECT EMPLOYEE_ID FROM EMPLOYEE WHERE EMPLOYEE_NO = '20260601');

-- ------------------------------------
-- DM 1. 관리자 ↔ 김부장
-- ROOM_NAME이 NULL인 DM은 참여자 조합으로 기존 방을 찾아 중복 생성을 막는다.
-- ------------------------------------
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

-- ------------------------------------
-- DM 2. 관리자 ↔ 이팀장
-- ------------------------------------
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

-- DM 메시지 3건을 한 번에 등록한다.
INSERT INTO CHAT_MESSAGE (ROOM_ID, SENDER_ID, MESSAGE_TYPE, CONTENT)
SELECT v.ROOM_ID, v.SENDER_ID, 'TEXT', v.CONTENT
FROM (
    SELECT @dmAdminKim AS ROOM_ID, @adminId AS SENDER_ID,
           '김부장님, 이번 주 개발 진행 상황 공유 부탁드립니다.' AS CONTENT
    UNION ALL
    SELECT @dmAdminKim, @kimId,
           '네, 오늘 오후에 진행 상황을 정리해서 보고드리겠습니다.'
    UNION ALL
    SELECT @dmAdminLee, @leeId,
           '관리자님, 다음 주 일정 관련하여 확인 요청드립니다.'
) v
WHERE NOT EXISTS (
    SELECT 1
    FROM CHAT_MESSAGE m
    WHERE m.ROOM_ID = v.ROOM_ID
      AND m.SENDER_ID <=> v.SENDER_ID
      AND m.CONTENT = v.CONTENT
);

-- ------------------------------------
-- GROUP 채팅방 6개
-- 이름이 있는 그룹방은 방 이름으로 중복을 확인한 뒤 한 번에 생성한다.
-- ------------------------------------
INSERT INTO CHAT_ROOM (ROOM_TYPE, ROOM_NAME)
SELECT v.ROOM_TYPE, v.ROOM_NAME
FROM (
    SELECT 'GROUP' AS ROOM_TYPE, '[테스트] 주간 개발 점검' AS ROOM_NAME
    UNION ALL SELECT 'GROUP', '[테스트] 화면 디자인 검토'
    UNION ALL SELECT 'GROUP', '[테스트] 개발팀 스프린트'
    UNION ALL SELECT 'GROUP', '[테스트] 인사팀 채용 회의'
    UNION ALL SELECT 'GROUP', '[테스트] 영업팀 주간 실적'
    UNION ALL SELECT 'GROUP', '[테스트] 재무관리팀 월 마감'
) v
WHERE NOT EXISTS (
    SELECT 1
    FROM CHAT_ROOM r
    WHERE r.ROOM_TYPE = v.ROOM_TYPE
      AND r.ROOM_NAME = v.ROOM_NAME
);

-- 그룹방 참여자 18명을 방 이름과 사번으로 연결해 한 번에 등록한다.
INSERT INTO CHAT_ROOM_MEMBER (ROOM_ID, EMPLOYEE_ID)
SELECT r.ROOM_ID, e.EMPLOYEE_ID
FROM (
    SELECT '[테스트] 주간 개발 점검' AS ROOM_NAME, 'admin' AS EMPLOYEE_NO
    UNION ALL SELECT '[테스트] 주간 개발 점검', '20260010'
    UNION ALL SELECT '[테스트] 주간 개발 점검', '20260102'

    UNION ALL SELECT '[테스트] 화면 디자인 검토', 'admin'
    UNION ALL SELECT '[테스트] 화면 디자인 검토', '20260102'
    UNION ALL SELECT '[테스트] 화면 디자인 검토', '20260601'

    UNION ALL SELECT '[테스트] 개발팀 스프린트', '20260102'
    UNION ALL SELECT '[테스트] 개발팀 스프린트', '20260301'
    UNION ALL SELECT '[테스트] 개발팀 스프린트', '20260601'

    UNION ALL SELECT '[테스트] 인사팀 채용 회의', '20260202'
    UNION ALL SELECT '[테스트] 인사팀 채용 회의', '20260203'
    UNION ALL SELECT '[테스트] 인사팀 채용 회의', '20260205'

    UNION ALL SELECT '[테스트] 영업팀 주간 실적', '20260312'
    UNION ALL SELECT '[테스트] 영업팀 주간 실적', '20260313'
    UNION ALL SELECT '[테스트] 영업팀 주간 실적', '20260315'

    UNION ALL SELECT '[테스트] 재무관리팀 월 마감', '20260402'
    UNION ALL SELECT '[테스트] 재무관리팀 월 마감', '20260403'
    UNION ALL SELECT '[테스트] 재무관리팀 월 마감', '20260405'
) v
JOIN CHAT_ROOM r
  ON r.ROOM_TYPE = 'GROUP'
 AND r.ROOM_NAME = v.ROOM_NAME
JOIN EMPLOYEE e
  ON e.EMPLOYEE_NO = v.EMPLOYEE_NO
WHERE NOT EXISTS (
    SELECT 1
    FROM CHAT_ROOM_MEMBER m
    WHERE m.ROOM_ID = r.ROOM_ID
      AND m.EMPLOYEE_ID = e.EMPLOYEE_ID
);

-- 그룹방 시스템·일반 메시지 12건을 한 번에 등록한다.
-- <=> 연산자는 NULL인 시스템 메시지 발신자도 기존 메시지와 정확히 비교한다.
INSERT INTO CHAT_MESSAGE (ROOM_ID, SENDER_ID, MESSAGE_TYPE, CONTENT)
SELECT r.ROOM_ID, e.EMPLOYEE_ID, v.MESSAGE_TYPE, v.CONTENT
FROM (
    SELECT '[테스트] 주간 개발 점검' AS ROOM_NAME, NULL AS SENDER_NO,
           'SYSTEM' AS MESSAGE_TYPE, '주간 개발 점검 채팅방이 생성되었습니다.' AS CONTENT
    UNION ALL
    SELECT '[테스트] 주간 개발 점검', '20260010', 'TEXT',
           '백엔드 기능 구현 현황을 공유드립니다.'

    UNION ALL
    SELECT '[테스트] 화면 디자인 검토', NULL, 'SYSTEM',
           '화면 디자인 검토 채팅방이 생성되었습니다.'
    UNION ALL
    SELECT '[테스트] 화면 디자인 검토', '20260601', 'TEXT',
           '메인 화면 시안을 1차로 정리했습니다.'

    UNION ALL
    SELECT '[테스트] 개발팀 스프린트', NULL, 'SYSTEM',
           '개발팀 스프린트 채팅방이 생성되었습니다.'
    UNION ALL
    SELECT '[테스트] 개발팀 스프린트', '20260102', 'TEXT',
           '이번 스프린트 우선순위를 공유드립니다.'

    UNION ALL
    SELECT '[테스트] 인사팀 채용 회의', NULL, 'SYSTEM',
           '인사팀 채용 회의 채팅방이 생성되었습니다.'
    UNION ALL
    SELECT '[테스트] 인사팀 채용 회의', '20260203', 'TEXT',
           '면접 대상자 일정표를 확인해 주세요.'

    UNION ALL
    SELECT '[테스트] 영업팀 주간 실적', NULL, 'SYSTEM',
           '영업팀 주간 실적 채팅방이 생성되었습니다.'
    UNION ALL
    SELECT '[테스트] 영업팀 주간 실적', '20260312', 'TEXT',
           '이번 주 고객사 미팅 결과를 정리해 주세요.'

    UNION ALL
    SELECT '[테스트] 재무관리팀 월 마감', NULL, 'SYSTEM',
           '재무관리팀 월 마감 채팅방이 생성되었습니다.'
    UNION ALL
    SELECT '[테스트] 재무관리팀 월 마감', '20260405', 'TEXT',
           '지출결의서 증빙 자료 검토를 완료했습니다.'
) v
JOIN CHAT_ROOM r
  ON r.ROOM_TYPE = 'GROUP'
 AND r.ROOM_NAME = v.ROOM_NAME
LEFT JOIN EMPLOYEE e
  ON e.EMPLOYEE_NO = v.SENDER_NO
WHERE NOT EXISTS (
    SELECT 1
    FROM CHAT_MESSAGE m
    WHERE m.ROOM_ID = r.ROOM_ID
      AND m.SENDER_ID <=> e.EMPLOYEE_ID
      AND m.CONTENT = v.CONTENT
);

COMMIT;

-- 관리자가 참여한 초기 테스트 방의 메시지 수 확인용 조회
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
  AND (
      r.ROOM_ID IN (@dmAdminKim, @dmAdminLee)
      OR r.ROOM_NAME IN ('[테스트] 주간 개발 점검', '[테스트] 화면 디자인 검토')
  )
ORDER BY r.ROOM_ID;
