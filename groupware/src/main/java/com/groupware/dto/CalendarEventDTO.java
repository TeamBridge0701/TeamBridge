package com.groupware.dto;

import lombok.Data;

@Data
public class CalendarEventDTO {
	private int eventId;
	private int employeeId;
	private String eventTitle;
	private String startDate;
	private String endDate;
	private String eventCategory;
	private Integer deptId;	// TEAM 일정일 때만 값 존재(등록 시점 부서로 고정)
	private String createdAt;
}
