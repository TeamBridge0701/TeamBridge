# TeamBridge

**사내 통합 그룹웨어** — 로그인한 임직원이 근태·공지·일정·자료·전자결재·조직도·실시간 채팅을 한 곳에서 처리하는 통합 업무 시스템입니다.

근태는 외부 앱, 결재는 메일/종이, 공지는 이메일, 대화는 개인 메신저로 흩어져 있던 사내 업무 도구를 하나의 SSO 계정으로 통합하고, 대면·구두 중심이던 결재를 이력이 남는 전자결재로 바꾸는 것을 목표로 4명이 4주간 개발했습니다.

---

## 주요 기능

| 화면 | 설명 |
| --- | --- |
| 로그인 | 사번 기반 인증, 정지 계정 로그인 차단 |
| 메인 대시보드 | 출퇴근 위젯, 공지 3건, 미니 캘린더, 생일자, 날씨, 결재 대기 알림 |
| 마이페이지 | 본인 인적사항 조회·수정, 비밀번호 변경 |
| 조직도 | 부서별 재직자 목록·상세, 채팅 진입 |
| 실시간 채팅 | 1:1 / 그룹 대화, 읽음·입력 중 표시, 파일 전송 (WebSocket·STOMP) |
| 공지사항 | 목록·상세·작성·수정 (팀장·부서장·관리자 작성 권한) |
| 캘린더 | 개인·팀·회사 일정, 연차 승인 시 자동 반영 |
| 자료실 | 전사/부서 제한 게시판, 다중 파일 첨부 |
| 전자결재 | 연차휴가신청서·지출결의서·프로젝트품의서, 다단계 순차 승인, 회수 |
| 출결 현황 | 본인 월간 출퇴근 기록·집계 조회 |
| 관리자 - 계정관리 | 계정 생성(사번 자동 채번)·정지/복구·비밀번호 초기화 |
| 관리자 - 출결관리 | 전 직원 출퇴근 기록 날짜별 직접 수정 |

## 기술 스택

| 분류 | 기술 |
| --- | --- |
| Backend | Java 21, Spring Boot, Spring Security |
| Database | MySQL 8.0, MyBatis (동적 SQL) |
| Frontend | Thymeleaf (SSR), HTML5/CSS3, ES6+ JavaScript, Fetch API |
| 실시간 통신 | WebSocket, STOMP, SockJS |
| 외부 API | OpenWeatherMap (날씨, 서버 프록시로 키 비노출) |
| 빌드 | Gradle |

## 시스템 구조

```
View (Thymeleaf SSR / Fetch API)
  → Security / Controller  (Spring Security Filter Chain, 요청 파라미터 처리)
    → Service              (업무 로직, 권한 재검증, @Transactional 경계)
      → Mapper             (MyBatis, 동적 SQL)
        → MySQL
```

- 실시간 채팅만 예외적으로 HTTP 컨트롤러 계층을 우회해 독립된 WebSocket(STOMP) 파이프라인을 사용합니다.
- **2-Tier 보안**: 화면단에서 권한 없는 UI를 숨기는 것과 별개로, Controller/Service 계층에서 세션 권한을 항상 재검증합니다(예: `canModifyNotice()`, `canModifyEvent()` 등).
- 4단계 권한(일반직원/팀장/부서장/관리자) 중 로그인 인가는 Spring Security(`ROLE_ADMIN`/`ROLE_EMPLOYEE`)가, 세부 조직 서열 판단은 `POSITION_RANK` 기반 애플리케이션 로직이 담당합니다.

## 데이터베이스

19개 테이블을 5개 도메인으로 정규화했습니다.

| 도메인 | 테이블 |
| --- | --- |
| 조직/인증 | EMPLOYEE, DEPARTMENT, POSITION |
| 근태/일정 | ATTENDANCE, CALENDAR_EVENT |
| 게시판/자료실 | NOTICE, REPOSITORY, ARCHIVE, ARCHIVE_FILE |
| 전자결재 | APPROVAL_FORM_TYPE, APPROVAL, APPROVAL_LINE, APPROVAL_REFERENCE, APPROVAL_FILE |
| 실시간 채팅 | CHAT_ROOM, CHAT_ROOM_MEMBER, CHAT_MESSAGE, CHAT_ATTACHMENT, CHAT_ROOM_MEMBER_SUSPENSION |

## 팀 구성

| 역할 | 담당 |
| --- | --- |
| 팀장 | 공통 인프라(로그인·권한), 마이페이지, 관리자(계정·출결) |
| 부팀장 | 메인 대시보드·출퇴근, 출결 현황, 캘린더 |
| 팀원 | 공지사항, 자료실, 전자결재 |
| 팀원 | 조직도, 실시간 채팅 |

각자 개인 fork에서 기능별 `work` 브랜치로 개발한 뒤 PR을 통해 팀 저장소 `main`에 병합하는 방식으로 협업했습니다. PR 리뷰는 권한 검증·SQL 성능·트랜잭션 원자성·에러 처리 4가지를 체크리스트로 확인했습니다.

## 실행 방법

**요구사항**: Java 21, MySQL 8.0, Gradle(wrapper 포함)

1. DB 준비
   ```sql
   CREATE DATABASE groupware;
   ```
   `schema/schema.sql` → `schema/data.sql` 순서로 실행합니다.

2. `groupware/src/main/resources/application.properties`에서 본인 환경에 맞게 설정
   - `spring.datasource.username` / `password`
   - `weather.api.key` — [OpenWeatherMap](https://openweathermap.org)에서 발급받은 본인 키로 교체 (비워두면 날씨 위젯만 "연동 실패"로 표시되고 나머지 기능은 정상 동작)

3. 실행
   ```bash
   cd groupware
   ./gradlew bootRun
   ```
   기본 포트: `http://localhost:8810`

---

*본 프로젝트는 교육 과정의 팀 프로젝트로 개발되었습니다.*
