package com.groupware.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import lombok.AccessLevel;
import lombok.Data;
import lombok.Getter;
import lombok.Setter;

@Data
public class CalendarEventDTO {
	private int eventId;
	private int employeeId;
	private String eventTitle;
	private String startDate;
	private String endDate;
	private String eventCategory;
	private Integer deptId;	// TEAM 일정일 때만 값 존재(등록 시점 부서로 고정)
	// COMPANY 일정 중에서도 "실제로 쉬는 날"인지 표시(NOTICE.IS_PINNED와 같은 패턴,
	// schema.sql: CALENDAR_EVENT.IS_HOLIDAY TINYINT(1) NOT NULL DEFAULT 0).
	// 국가 공휴일/대체공휴일/회사 지정 휴일 전부 이 체크 하나로 처리하고, 어떤 종류인지는
	// eventTitle에 자유롭게 적는다(예: "광복절 대체공휴일") - 셋을 시스템에서 다르게
	// 취급할 이유가 없어서 컬럼을 안 나눔(2026-07-22 김우주 결정)
	//
	// 필드명이 이미 "is"로 시작하는 boolean이라 Lombok @Data가 자동으로 만드는 getter/setter는
	// isHoliday()/setHoliday()인데, Jackson은 isXxx() getter를 보면 "is"를 떼고 JSON 키를
	// "holiday"로 만든다. 그래서 이 필드는 @Data 자동 생성을 끄고, getter/setter에 직접
	// @JsonProperty("isHoliday")를 달아서 JSON 키를 강제로 고정한다(메서드 이름 자체는 기존
	// CalendarService가 쓰던 isHoliday()/setHoliday() 그대로 유지해서 다른 곳은 안 건드림).
	// (2026-07-22 발견 - 이거 없으면 프론트(calendar.js)가 항상 "isHoliday"로 읽는데
	// 서버는 "holiday"로 내려줘서 화면에 공휴일이 늘 false로만 보임)
	@Getter(AccessLevel.NONE)
	@Setter(AccessLevel.NONE)
	private boolean isHoliday;
	private String createdAt;

	@JsonProperty("isHoliday")
	public boolean isHoliday() {
		return isHoliday;
	}

	@JsonProperty("isHoliday")
	public void setHoliday(boolean isHoliday) {
		this.isHoliday = isHoliday;
	}
}
